// PROTOTYPE — throwaway. Lives on branch `prototype/notification-feed`, never merged.
// Question (wayfinder ticket "How the Notification feed looks and behaves", #9):
// Three variants of the Student Notification feed, switchable via `?variant=A|B|C`,
// mounted in the real app layout (sidebar + pages):
//   A  Bell in sidebar header → popover dropdown
//   B  Sidebar nav item with count → full /notifications page
//   C  Bell in the account footer → right-hand slide-over sheet, grouped by course
// Behaviour toggles (toast, what "read" means, archive window, empty feed) live in the
// floating bar and apply to every variant. No Knock: an in-memory stub stands in for
// Knock's feed (seen / read / archived kept separate, as Knock does) and the
// "+ incoming" button stands in for the websocket.
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Dialog, Popover } from "radix-ui";
import { toast } from "sonner";
import {
	Archive,
	Bell,
	BellOff,
	Check,
	CheckCheck,
	ChevronLeft,
	ChevronRight,
	MessageSquare,
	Receipt,
	X,
} from "lucide-react";
import { cn } from "~/lib/utils";

// ─── Stub data ────────────────────────────────────────────────────────────

type Kind = "refund-approved" | "refund-declined" | "comment-reply";

export interface ProtoNotification {
	id: string;
	kind: Kind;
	courseTitle: string;
	title: string;
	body: string;
	note?: string;
	href: string;
	insertedAt: number;
	seenAt: number | null;
	readAt: number | null;
	archivedAt: number | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const COURSES = {
	ts: {
		slug: "introduction-to-typescript",
		title: "Introduction to TypeScript",
	},
	api: {
		slug: "building-rest-apis-with-nodejs",
		title: "Building REST APIs with Node.js",
	},
	ds: {
		slug: "design-systems-with-tailwind",
		title: "Design Systems with Tailwind",
	},
	viz: {
		slug: "practical-data-visualisation",
		title: "Practical Data Visualisation",
	},
	k8s: {
		slug: "shipping-with-docker-and-kubernetes",
		title: "Shipping with Docker and Kubernetes",
	},
};

function reply(
	id: string,
	ago: number,
	course: { slug: string; title: string },
	lessonId: number,
	lessonTitle: string,
	author: string,
	excerpt: string,
	state: "unseen" | "seen" | "read" = "read",
): ProtoNotification {
	const t = Date.now() - ago;
	return {
		id,
		kind: "comment-reply",
		courseTitle: course.title,
		title: `${author} replied to your comment on ${lessonTitle} (${course.title})`,
		body: excerpt.length > 140 ? `${excerpt.slice(0, 139)}…` : excerpt,
		href: `/courses/${course.slug}/lessons/${lessonId}#comment-${id}`,
		insertedAt: t,
		seenAt: state === "unseen" ? null : t + MIN,
		readAt: state === "read" ? t + 2 * MIN : null,
		archivedAt: null,
	};
}

function refund(
	id: string,
	ago: number,
	course: { title: string },
	kind: "refund-approved" | "refund-declined",
	body: string,
	note: string | undefined,
	state: "unseen" | "seen" | "read" = "read",
): ProtoNotification {
	const t = Date.now() - ago;
	return {
		id,
		kind,
		courseTitle: course.title,
		title:
			kind === "refund-approved"
				? `Your refund request for ${course.title} was approved`
				: `Your refund request for ${course.title} was declined`,
		body,
		note,
		href: "/settings",
		insertedAt: t,
		seenAt: state === "unseen" ? null : t + MIN,
		readAt: state === "read" ? t + 2 * MIN : null,
		archivedAt: null,
	};
}

function seedNotifications(): ProtoNotification[] {
	return [
		reply(
			"n1",
			6 * MIN,
			COURSES.ts,
			1,
			"What is TypeScript?",
			"Sarah Chen (Instructor)",
			"Good question! Structural typing means two types are compatible when their shapes match, not their names. Try assigning a Point3D to a Point2D variable and see what happens.",
			"unseen",
		),
		refund(
			"n2",
			2 * HOUR,
			COURSES.ds,
			"refund-approved",
			"$49.00, the full amount you paid, is on its way back. You no longer have access to the course; your progress is kept.",
			"Sorry the course wasn't the right fit. Hope to see you back!",
			"unseen",
		),
		reply(
			"n3",
			5 * HOUR,
			COURSES.api,
			20,
			"What is a REST API?",
			"James Park",
			"I had the same confusion about PUT vs PATCH. What helped me: PUT replaces the whole resource, PATCH only touches the fields you send.",
			"unseen",
		),
		refund(
			"n4",
			1 * DAY + 3 * HOUR,
			COURSES.viz,
			"refund-declined",
			"You can raise a new request.",
			"This request came in after the 30-day refund window. If something in the course is broken, please tell us which lesson.",
			"seen",
		),
		reply(
			"n5",
			2 * DAY,
			COURSES.ts,
			1,
			"What is TypeScript?",
			"Olivia Martinez",
			"+1, the playground link in the lesson notes is really handy for this.",
			"seen",
		),
		reply(
			"n6",
			4 * DAY,
			COURSES.k8s,
			55,
			"Why Containers",
			"Marcus Johnson (Instructor)",
			"Containers share the host kernel, VMs don't. That's the whole reason startup is seconds instead of minutes. We go deeper on this in module 2.",
			"read",
		),
		refund(
			"n7",
			9 * DAY,
			COURSES.k8s,
			"refund-approved",
			"$120.00, the full amount you paid, is on its way back.",
			undefined,
			"read",
		),
		reply(
			"n8",
			15 * DAY,
			COURSES.api,
			20,
			"What is a REST API?",
			"Liam Thompson",
			"Does anyone know whether the course covers GraphQL later on, or is it REST only throughout?",
			"read",
		),
		reply(
			"n9",
			33 * DAY,
			COURSES.viz,
			49,
			"Encodings and What They Say",
			"Priya Nair (Instructor)",
			"Position on a common scale is the most accurate encoding we have. Colour hue is great for categories but terrible for quantities, as your chart shows.",
			"read",
		),
		reply(
			"n10",
			48 * DAY,
			COURSES.ts,
			1,
			"What is TypeScript?",
			"Emma Wilson",
			"Thanks for posting this, I was stuck on exactly the same error.",
			"read",
		),
		refund(
			"n11",
			71 * DAY,
			COURSES.api,
			"refund-declined",
			"You can raise a new request.",
			"We could not match this request to a Purchase on your account. Please raise it again from the course page.",
			"read",
		),
		reply(
			"n12",
			96 * DAY,
			COURSES.ds,
			40,
			"What a Design System Is For",
			"Sarah Chen (Instructor)",
			"Tokens first, components second. If your spacing scale is inconsistent no amount of component work will save you.",
			"read",
		),
		reply(
			"n13",
			140 * DAY,
			COURSES.k8s,
			55,
			"Why Containers",
			"James Park",
			"Podman works fine for all the exercises too, for what it's worth.",
			"read",
		),
		refund(
			"n14",
			210 * DAY,
			COURSES.ts,
			"refund-approved",
			"$29.00, the full amount you paid, is on its way back.",
			"Refunded as a goodwill gesture after the video outage.",
			"read",
		),
	];
}

const INCOMING: Array<() => ProtoNotification> = [
	() =>
		reply(
			`live-${Date.now()}`,
			0,
			COURSES.ts,
			1,
			"What is TypeScript?",
			"Sarah Chen (Instructor)",
			"Following up: I've added a short appendix lesson on `satisfies` since a few of you asked about it here.",
			"unseen",
		),
	() =>
		refund(
			`live-${Date.now()}`,
			0,
			COURSES.api,
			"refund-approved",
			"$79.00, the full amount you paid, is on its way back. You no longer have access to the course; your progress is kept.",
			undefined,
			"unseen",
		),
	() =>
		refund(
			`live-${Date.now()}`,
			0,
			COURSES.viz,
			"refund-declined",
			"You can raise a new request.",
			"Team Licence refunds need to be raised by the Team Admin who bought it.",
			"unseen",
		),
	() =>
		reply(
			`live-${Date.now()}`,
			0,
			COURSES.k8s,
			55,
			"Why Containers",
			"Olivia Martinez",
			"Agreed, the diagram in this lesson finally made namespaces click for me.",
			"unseen",
		),
];

// ─── Store ────────────────────────────────────────────────────────────────

export const VARIANTS = [
	{ key: "A", name: "Bell + dropdown" },
	{ key: "B", name: "Nav item + full page" },
	{ key: "C", name: "Slide-over, by course" },
	{ key: "D", name: "Combined: dot bell → overview" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

type ReadRule = "open" | "click" | "explicit";
type ArchiveRule = "all" | "90d";

interface Options {
	toast: boolean;
	readRule: ReadRule;
	archiveRule: ArchiveRule;
	empty: boolean;
	bellPos: "top" | "bottom";
}

interface FeedStore {
	enabled: boolean;
	variant: VariantKey;
	items: ProtoNotification[];
	hiddenOld: number;
	unseen: number;
	unread: number;
	options: Options;
	lastAction: string;
	setOptions: (o: Partial<Options>) => void;
	openFeed: () => void;
	clickItem: (n: ProtoNotification) => void;
	markRead: (id: string) => void;
	markUnread: (id: string) => void;
	markAllRead: () => void;
	archive: (id: string) => void;
	simulateIncoming: () => void;
}

const Ctx = createContext<FeedStore | null>(null);

function useFeed() {
	const s = useContext(Ctx);
	if (!s) throw new Error("NotificationFeedProvider missing");
	return s;
}

const VARIANT_KEY = "proto-notification-variant";

function useVariant(): VariantKey {
	const [params] = useSearchParams();
	const fromUrl = params.get("variant");
	const [stored, setStored] = useState<VariantKey>("A");
	useEffect(() => {
		try {
			if (fromUrl && VARIANTS.some((v) => v.key === fromUrl)) {
				sessionStorage.setItem(VARIANT_KEY, fromUrl);
				setStored(fromUrl as VariantKey);
			} else {
				const s = sessionStorage.getItem(VARIANT_KEY);
				if (s && VARIANTS.some((v) => v.key === s)) setStored(s as VariantKey);
			}
		} catch {}
	}, [fromUrl]);
	if (fromUrl && VARIANTS.some((v) => v.key === fromUrl))
		return fromUrl as VariantKey;
	return stored;
}

export function NotificationFeedProvider({
	isStudent,
	children,
}: {
	isStudent: boolean;
	children: React.ReactNode;
}) {
	const variant = useVariant();
	const navigate = useNavigate();
	const [all, setAll] = useState<ProtoNotification[]>(seedNotifications);
	const [options, setOpts] = useState<Options>({
		toast: true,
		readRule: "click",
		archiveRule: "all",
		empty: false,
		bellPos: "top",
	});
	const [lastAction, setLastAction] = useState("—");
	const [incomingIdx, setIncomingIdx] = useState(0);

	const patch = useCallback(
		(pred: (n: ProtoNotification) => boolean, p: Partial<ProtoNotification>) =>
			setAll((xs) => xs.map((n) => (pred(n) ? { ...n, ...p } : n))),
		[],
	);

	const visible = useMemo(() => {
		if (options.empty) return { items: [], hiddenOld: 0 };
		const live = all.filter((n) => !n.archivedAt);
		if (options.archiveRule === "90d") {
			const cutoff = Date.now() - 90 * DAY;
			const items = live.filter((n) => n.insertedAt >= cutoff);
			return { items, hiddenOld: live.length - items.length };
		}
		return { items: live, hiddenOld: 0 };
	}, [all, options.empty, options.archiveRule]);

	const store: FeedStore = {
		enabled: isStudent,
		variant,
		items: visible.items,
		hiddenOld: visible.hiddenOld,
		unseen: visible.items.filter((n) => !n.seenAt).length,
		unread: visible.items.filter((n) => !n.readAt).length,
		options,
		lastAction,
		setOptions: (o) => setOpts((prev) => ({ ...prev, ...o })),
		openFeed: () => {
			const now = Date.now();
			patch((n) => !n.seenAt, { seenAt: now });
			if (options.readRule === "open") {
				patch((n) => !n.readAt, { readAt: now });
				setLastAction("opened feed → all seen + all read");
			} else {
				setLastAction("opened feed → all seen (markAllAsSeen)");
			}
		},
		clickItem: (n) => {
			const now = Date.now();
			if (options.readRule !== "explicit") {
				patch((x) => x.id === n.id, {
					readAt: n.readAt ?? now,
					seenAt: n.seenAt ?? now,
				});
				setLastAction(`clicked ${n.id} → read, navigate ${n.href}`);
			} else {
				setLastAction(`clicked ${n.id} → navigate only (explicit read rule)`);
			}
			navigate(n.href);
		},
		markRead: (id) => {
			patch((n) => n.id === id, { readAt: Date.now() });
			setLastAction(`marked ${id} read`);
		},
		markUnread: (id) => {
			patch((n) => n.id === id, { readAt: null });
			setLastAction(`marked ${id} unread`);
		},
		markAllRead: () => {
			patch((n) => !n.readAt, { readAt: Date.now(), seenAt: Date.now() });
			setLastAction("mark all as read");
		},
		archive: (id) => {
			patch((n) => n.id === id, { archivedAt: Date.now() });
			setLastAction(`archived ${id}`);
		},
		simulateIncoming: () => {
			const n = INCOMING[incomingIdx % INCOMING.length]();
			setIncomingIdx((i) => i + 1);
			setAll((xs) => [n, ...xs]);
			setLastAction(`websocket: new ${n.kind} (${n.id})`);
			if (options.toast && isStudent) {
				toast(n.title, {
					description: n.note ?? n.body,
					icon: kindIcon(n.kind),
					action: {
						label: "View",
						onClick: () => {
							patch((x) => x.id === n.id, {
								readAt: Date.now(),
								seenAt: Date.now(),
							});
							navigate(n.href);
						},
					},
				});
			}
		},
	};

	return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// ─── Shared bits ──────────────────────────────────────────────────────────

function kindIcon(kind: Kind) {
	switch (kind) {
		case "comment-reply":
			return <MessageSquare className="size-4 text-sky-500" />;
		case "refund-approved":
			return <Receipt className="size-4 text-emerald-500" />;
		case "refund-declined":
			return <Receipt className="size-4 text-amber-500" />;
	}
}

function ago(t: number) {
	const d = Date.now() - t;
	if (d < MIN) return "just now";
	if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
	if (d < DAY) return `${Math.floor(d / HOUR)}h ago`;
	if (d < 30 * DAY) return `${Math.floor(d / DAY)}d ago`;
	return new Date(t).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: d > 300 * DAY ? "numeric" : undefined,
	});
}

function Badge({ count, className }: { count: number; className?: string }) {
	if (count === 0) return null;
	return (
		<span
			className={cn(
				"flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white",
				className,
			)}
		>
			{count > 9 ? "9+" : count}
		</span>
	);
}

function EmptyState({ compact }: { compact?: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-2 text-center text-muted-foreground",
				compact ? "py-10" : "py-24",
			)}
		>
			<BellOff className="size-6" />
			<div className="text-sm font-medium text-foreground">
				No notifications yet
			</div>
			<div className="max-w-64 text-xs">
				You'll hear here when someone replies to your comments or when a refund
				request is decided.
			</div>
		</div>
	);
}

function OldHiddenNote() {
	const { hiddenOld } = useFeed();
	if (!hiddenOld) return null;
	return (
		<div className="px-4 py-3 text-center text-xs text-muted-foreground">
			{hiddenOld} older notification{hiddenOld === 1 ? "" : "s"} (90+ days)
			hidden
		</div>
	);
}

// ─── Entry points mounted in the sidebar ──────────────────────────────────

export function NotificationEntry({
	placement,
}: {
	placement: "header" | "nav" | "footer";
}) {
	const s = useContext(Ctx);
	if (!s?.enabled) return null;
	if (placement === "header" && s.variant === "A") return <VariantABell />;
	if (placement === "nav" && s.variant === "B") return <VariantBNavItem />;
	if (placement === "footer" && s.variant === "C") return <VariantCBell />;
	if (s.variant === "D") {
		if (placement === "header" && s.options.bellPos === "top")
			return <VariantDBell placement="header" />;
		if (placement === "footer" && s.options.bellPos === "bottom")
			return <VariantDBell placement="footer" />;
	}
	return null;
}

// ─── Variant A: bell + popover dropdown ───────────────────────────────────

function VariantABell() {
	const s = useFeed();
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<"all" | "unread">("all");
	const list =
		tab === "unread" ? s.items.filter((n) => !n.readAt) : s.items.slice(0, 20);

	return (
		<Popover.Root
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) s.openFeed();
			}}
		>
			<Popover.Trigger asChild>
				<button
					type="button"
					title="Notifications"
					className="relative rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					<Bell className="size-4" />
					<Badge count={s.unseen} className="absolute -right-1 -top-1" />
				</button>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content
					side="right"
					align="start"
					sideOffset={12}
					className="z-50 flex max-h-[min(36rem,80vh)] w-96 flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl"
				>
					<div className="flex items-center justify-between border-b px-4 py-3">
						<div className="text-sm font-semibold">Notifications</div>
						<button
							type="button"
							onClick={s.markAllRead}
							disabled={s.unread === 0}
							className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
						>
							<CheckCheck className="size-3.5" /> Mark all as read
						</button>
					</div>
					<div className="flex gap-1 border-b px-3 py-2 text-xs">
						{(["all", "unread"] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={cn(
									"rounded-full px-2.5 py-1 capitalize",
									tab === t
										? "bg-accent font-medium text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/50",
								)}
							>
								{t}
								{t === "unread" && s.unread > 0 ? ` (${s.unread})` : ""}
							</button>
						))}
					</div>
					<div className="flex-1 overflow-y-auto">
						{list.length === 0 ? (
							<EmptyState compact />
						) : (
							list.map((n) => (
								<div
									key={n.id}
									className={cn(
										"group relative flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-accent/50",
										!n.readAt && "bg-primary/5",
									)}
								>
									<div className="mt-0.5 shrink-0">{kindIcon(n.kind)}</div>
									<button
										type="button"
										onClick={() => {
											setOpen(false);
											s.clickItem(n);
										}}
										className="min-w-0 flex-1 text-left"
									>
										<div
											className={cn(
												"text-sm leading-snug",
												!n.readAt && "font-medium",
											)}
										>
											{n.title}
										</div>
										<div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
											{n.kind === "comment-reply" ? `“${n.body}”` : n.body}
										</div>
										<div
											className="mt-1 text-[11px] text-muted-foreground"
											suppressHydrationWarning
										>
											{ago(n.insertedAt)}
										</div>
									</button>
									<div className="flex shrink-0 flex-col items-end gap-1">
										{!n.readAt && (
											<span className="mt-1.5 size-2 rounded-full bg-primary" />
										)}
										<button
											type="button"
											title={n.readAt ? "Mark as unread" : "Mark as read"}
											onClick={() =>
												n.readAt ? s.markUnread(n.id) : s.markRead(n.id)
											}
											className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
										>
											<Check className="size-3.5" />
										</button>
									</div>
								</div>
							))
						)}
						{tab === "all" && <OldHiddenNote />}
					</div>
					<Link
						to="/settings"
						onClick={() => setOpen(false)}
						className="border-t px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground"
					>
						Showing latest 20 · Refund Requests live in Settings
					</Link>
				</Popover.Content>
			</Popover.Portal>
		</Popover.Root>
	);
}

// ─── Variant B: nav item + full page ──────────────────────────────────────

// ─── Variant D: A's bell (dot only, top or bottom) → B's overview page,
//     grouped by course (from C), with mark all as read ───────────────────

function VariantDBell({ placement }: { placement: "header" | "footer" }) {
	const s = useFeed();
	return (
		<Link
			to="/notifications"
			title={s.unseen > 0 ? "New notifications" : "Notifications"}
			className={cn(
				"relative rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				placement === "header" ? "p-1.5" : "p-1 text-sidebar-foreground/50",
			)}
		>
			<Bell className="size-4" />
			{s.unseen > 0 && (
				<span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
			)}
		</Link>
	);
}

function VariantBNavItem() {
	const s = useFeed();
	return (
		<Link
			to="/notifications"
			className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
		>
			<Bell className="size-4" />
			Notifications
			<Badge count={s.unseen} className="ml-auto" />
		</Link>
	);
}

function groupLabel(t: number) {
	const d = Date.now() - t;
	if (d < DAY) return "Today";
	if (d < 7 * DAY) return "This week";
	if (d < 30 * DAY) return "This month";
	return "Earlier";
}

export function NotificationsPage() {
	const s = useFeed();
	const [filter, setFilter] = useState<
		"all" | "unread" | "replies" | "refunds"
	>("all");
	const [groupBy, setGroupBy] = useState<"time" | "course">("course");
	const byCourse = s.variant === "D" && groupBy === "course";
	// opening the page = opening the feed
	// biome-ignore lint/correctness/useExhaustiveDependencies: run once per mount
	useEffect(() => {
		if (s.enabled) s.openFeed();
	}, []);

	if (!s.enabled)
		return (
			<div className="p-8 text-sm text-muted-foreground">
				Notifications are for Students. Pick a Student in the DevUI panel.
			</div>
		);

	const list = s.items.filter((n) =>
		filter === "unread"
			? !n.readAt
			: filter === "replies"
				? n.kind === "comment-reply"
				: filter === "refunds"
					? n.kind !== "comment-reply"
					: true,
	);
	const groups: Array<[string, ProtoNotification[]]> = [];
	for (const n of list) {
		const g = byCourse ? n.courseTitle : groupLabel(n.insertedAt);
		const existing = byCourse
			? groups.find(([k]) => k === g)
			: groups[groups.length - 1];
		if (existing && existing[0] === g) existing[1].push(n);
		else groups.push([g, [n]]);
	}

	return (
		<div className="mx-auto max-w-3xl p-8">
			<div className="mb-6 flex items-end justify-between">
				<div>
					<h1 className="text-2xl font-bold">Notifications</h1>
					<p className="text-sm text-muted-foreground">
						{s.unread} unread · {s.items.length} total
					</p>
				</div>
				<button
					type="button"
					onClick={s.markAllRead}
					disabled={s.unread === 0}
					className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
				>
					<CheckCheck className="size-4" /> Mark all as read
				</button>
			</div>
			{s.variant === "D" && (
				<div className="mb-4 flex items-center gap-1 text-xs">
					<span className="mr-1 text-muted-foreground">Group by</span>
					{(["course", "time"] as const).map((g) => (
						<button
							key={g}
							type="button"
							onClick={() => setGroupBy(g)}
							className={cn(
								"rounded-full px-2.5 py-1 capitalize",
								groupBy === g
									? "bg-accent font-medium text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50",
							)}
						>
							{g}
						</button>
					))}
				</div>
			)}
			<div className="mb-6 flex gap-2 border-b">
				{(["all", "unread", "replies", "refunds"] as const).map((f) => (
					<button
						key={f}
						type="button"
						onClick={() => setFilter(f)}
						className={cn(
							"-mb-px border-b-2 px-3 py-2 text-sm capitalize",
							filter === f
								? "border-primary font-medium"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{f}
					</button>
				))}
			</div>
			{list.length === 0 ? (
				<EmptyState />
			) : (
				groups.map(([label, ns]) => (
					<section key={label} className="mb-8">
						<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{label}
						</h2>
						<div className="space-y-2">
							{ns.map((n) => (
								<article
									key={n.id}
									className={cn(
										"flex gap-4 rounded-lg border p-4",
										!n.readAt && "border-primary/40 bg-primary/5",
									)}
								>
									<div className="mt-0.5">{kindIcon(n.kind)}</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-start justify-between gap-4">
											<div
												className={cn("text-sm", !n.readAt && "font-semibold")}
											>
												{n.title}
											</div>
											<div
												className="shrink-0 text-xs text-muted-foreground"
												suppressHydrationWarning
											>
												{ago(n.insertedAt)}
											</div>
										</div>
										{n.kind === "comment-reply" ? (
											<blockquote className="mt-2 border-l-2 pl-3 text-sm text-muted-foreground">
												{n.body}
											</blockquote>
										) : (
											<p className="mt-1 text-sm text-muted-foreground">
												{n.body}
											</p>
										)}
										{n.note && (
											<p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
												<span className="font-medium">Note from Cadence: </span>
												{n.note}
											</p>
										)}
										<div className="mt-3 flex gap-3 text-xs">
											<button
												type="button"
												onClick={() => s.clickItem(n)}
												className="font-medium text-primary hover:underline"
											>
												{n.kind === "comment-reply"
													? "Go to reply"
													: "View refund request"}
											</button>
											<button
												type="button"
												onClick={() =>
													n.readAt ? s.markUnread(n.id) : s.markRead(n.id)
												}
												className="text-muted-foreground hover:text-foreground"
											>
												{n.readAt ? "Mark unread" : "Mark read"}
											</button>
											<button
												type="button"
												onClick={() => s.archive(n.id)}
												className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
											>
												<Archive className="size-3" /> Archive
											</button>
										</div>
									</div>
								</article>
							))}
						</div>
					</section>
				))
			)}
			<OldHiddenNote />
		</div>
	);
}

// ─── Variant C: account-footer bell + slide-over grouped by course ────────

function VariantCBell() {
	const s = useFeed();
	const [open, setOpen] = useState(false);
	const byCourse = useMemo(() => {
		const m = new Map<string, ProtoNotification[]>();
		for (const n of s.items) {
			const arr = m.get(n.courseTitle) ?? [];
			arr.push(n);
			m.set(n.courseTitle, arr);
		}
		return [...m.entries()];
	}, [s.items]);

	return (
		<Dialog.Root
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (o) s.openFeed();
			}}
		>
			<Dialog.Trigger asChild>
				<button
					type="button"
					title="Notifications"
					className="relative rounded-md p-1 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
				>
					<Bell className="size-4" />
					{s.unseen > 0 && (
						<span className="absolute right-0 top-0 size-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
					)}
				</button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-black/30" />
				<Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[28rem] flex-col border-l bg-background shadow-2xl">
					<div className="flex items-center justify-between border-b px-5 py-4">
						<div>
							<Dialog.Title className="text-base font-semibold">
								Notifications
							</Dialog.Title>
							<Dialog.Description className="text-xs text-muted-foreground">
								{s.unread} unread, grouped by course
							</Dialog.Description>
						</div>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={s.markAllRead}
								disabled={s.unread === 0}
								title="Mark all as read"
								className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
							>
								<CheckCheck className="size-4" />
							</button>
							<Dialog.Close className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
								<X className="size-4" />
							</Dialog.Close>
						</div>
					</div>
					<div className="flex-1 overflow-y-auto">
						{byCourse.length === 0 ? (
							<EmptyState />
						) : (
							byCourse.map(([course, ns]) => {
								const unread = ns.filter((n) => !n.readAt).length;
								return (
									<details key={course} open={unread > 0} className="border-b">
										<summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-medium hover:bg-accent/50">
											<span className="flex-1 truncate">{course}</span>
											{unread > 0 && (
												<span className="rounded-full bg-primary px-2 text-[11px] text-primary-foreground">
													{unread} new
												</span>
											)}
											<span className="text-xs text-muted-foreground">
												{ns.length}
											</span>
										</summary>
										<ul>
											{ns.map((n) => (
												<li
													key={n.id}
													className="group flex items-start gap-3 px-5 py-2.5 pl-8 hover:bg-accent/40"
												>
													<span
														className={cn(
															"mt-1.5 size-1.5 shrink-0 rounded-full",
															n.readAt ? "bg-transparent" : "bg-primary",
														)}
													/>
													<button
														type="button"
														onClick={() => {
															setOpen(false);
															s.clickItem(n);
														}}
														className="min-w-0 flex-1 text-left"
													>
														<div
															className={cn(
																"text-sm",
																n.readAt
																	? "text-muted-foreground"
																	: "font-medium",
															)}
														>
															{n.kind === "comment-reply"
																? n.title.split(" replied")[0] + " replied"
																: n.kind === "refund-approved"
																	? "Refund approved"
																	: "Refund declined"}
															<span
																className="ml-2 text-xs font-normal text-muted-foreground"
																suppressHydrationWarning
															>
																{ago(n.insertedAt)}
															</span>
														</div>
														<div className="truncate text-xs text-muted-foreground">
															{n.note ?? n.body}
														</div>
													</button>
													<button
														type="button"
														title="Archive"
														onClick={() => s.archive(n.id)}
														className="invisible rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:visible"
													>
														<Archive className="size-3.5" />
													</button>
												</li>
											))}
										</ul>
									</details>
								);
							})
						)}
						<OldHiddenNote />
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

// ─── Floating prototype bar ───────────────────────────────────────────────

export function NotificationPrototypeBar() {
	const s = useContext(Ctx);
	const [, setParams] = useSearchParams();
	const idx = VARIANTS.findIndex((v) => v.key === s?.variant);

	const go = useCallback(
		(delta: number) => {
			const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
			setParams(
				(p) => {
					p.set("variant", next.key);
					return p;
				},
				{ replace: true },
			);
		},
		[idx, setParams],
	);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			const el = e.target as HTMLElement | null;
			if (
				el &&
				(el.tagName === "INPUT" ||
					el.tagName === "TEXTAREA" ||
					el.tagName === "SELECT" ||
					el.isContentEditable)
			)
				return;
			if (e.key === "ArrowLeft") go(-1);
			if (e.key === "ArrowRight") go(1);
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [go]);

	if (process.env.NODE_ENV === "production" || !s) return null;
	const v = VARIANTS[idx];

	return (
		<div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-xs text-zinc-100 shadow-2xl ring-1 ring-fuchsia-500/60">
			<div className="flex items-center gap-2">
				<span className="rounded bg-fuchsia-600 px-1.5 py-0.5 text-[10px] font-bold uppercase">
					Prototype
				</span>
				<button
					type="button"
					onClick={() => go(-1)}
					className="rounded p-1 hover:bg-zinc-700"
				>
					<ChevronLeft className="size-4" />
				</button>
				<span className="min-w-44 text-center font-medium">
					{v.key} ({v.name})
				</span>
				<button
					type="button"
					onClick={() => go(1)}
					className="rounded p-1 hover:bg-zinc-700"
				>
					<ChevronRight className="size-4" />
				</button>
				<button
					type="button"
					onClick={s.simulateIncoming}
					className="rounded bg-fuchsia-600 px-2 py-1 font-medium hover:bg-fuchsia-500"
				>
					+ incoming
				</button>
			</div>
			<div className="flex items-center gap-3 text-zinc-300">
				<label className="flex items-center gap-1">
					<input
						type="checkbox"
						checked={s.options.toast}
						onChange={(e) => s.setOptions({ toast: e.target.checked })}
					/>
					toast
				</label>
				<label className="flex items-center gap-1">
					read on
					<select
						value={s.options.readRule}
						onChange={(e) =>
							s.setOptions({ readRule: e.target.value as ReadRule })
						}
						className="rounded bg-zinc-800 px-1"
					>
						<option value="open">opening feed</option>
						<option value="click">clicking item</option>
						<option value="explicit">explicit only</option>
					</select>
				</label>
				<label className="flex items-center gap-1">
					show
					<select
						value={s.options.archiveRule}
						onChange={(e) =>
							s.setOptions({ archiveRule: e.target.value as ArchiveRule })
						}
						className="rounded bg-zinc-800 px-1"
					>
						<option value="all">everything</option>
						<option value="90d">last 90 days</option>
					</select>
				</label>
				{s.variant === "D" && (
					<label className="flex items-center gap-1">
						bell
						<select
							value={s.options.bellPos}
							onChange={(e) =>
								s.setOptions({
									bellPos: e.target.value as "top" | "bottom",
								})
							}
							className="rounded bg-zinc-800 px-1"
						>
							<option value="top">top</option>
							<option value="bottom">bottom</option>
						</select>
					</label>
				)}
				<label className="flex items-center gap-1">
					<input
						type="checkbox"
						checked={s.options.empty}
						onChange={(e) => s.setOptions({ empty: e.target.checked })}
					/>
					empty
				</label>
			</div>
			<div className="font-mono text-[10px] text-zinc-400">
				{s.enabled ? "student" : "NOT a Student: feed hidden"} · unseen{" "}
				{s.unseen} · unread {s.unread} · visible {s.items.length} · last:{" "}
				{s.lastAction}
			</div>
		</div>
	);
}
