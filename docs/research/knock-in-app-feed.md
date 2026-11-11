# Does Knock fit Cadence's in-app feed?

Research for issue #8 (child of map #5, "In-app Notifications for Students"). Researched 2026-11-11.

**Verdict: Knock fits, with caveats.** Nothing blocks it, so this note does not compare it with Novu or MagicBell. The caveats:

1. Server rendering fires an identify call unless the client is gated until hydration.
2. Knock's prebuilt CSS beats Tailwind utilities, so a headless feed built with shadcn is the better fit.
3. Enhanced security mode is required in production.
4. Knock has no local emulator, and in-app sends in development count toward usage.
5. EU data residency is not available yet.

Terminology: a **Knock user** is a Cadence **Student**, and a Knock in-app **message / feed item** is a Cadence **Notification** (see `GLOSSARY.md`). Statements marked _(inference)_ are my reading of the source, not documented behaviour.

## Package versions (npm, 2026-11-11)

| Package | Version | Role |
| --- | --- | --- |
| [`@knocklabs/react`](https://www.npmjs.com/package/@knocklabs/react) | 0.15.1 | Prebuilt components plus re-exported hooks. Peers: `react ^17\|^18\|^19`; `next` and `@tanstack/react-router` are optional peers. |
| [`@knocklabs/react-core`](https://www.npmjs.com/package/@knocklabs/react-core) | 0.17.1 | Providers and hooks only (headless). Its only peer is `react`. |
| [`@knocklabs/client`](https://www.npmjs.com/package/@knocklabs/client) | 0.23.1 | Browser JS SDK: feed client and socket. |
| [`@knocklabs/node`](https://www.npmjs.com/package/@knocklabs/node) | 1.41.1 | Server SDK: identify, trigger, token signing. |

Source repo for the JavaScript packages: <https://github.com/knocklabs/javascript>.

## 1. Prebuilt components vs headless hooks, and Tailwind

**Prebuilt components** ([docs](https://docs.knock.app/in-app-ui/react/feed)):

- `KnockProvider` → `KnockFeedProvider feedId=…` → `NotificationIconButton` (the bell, badged on unseen by default or on unread with `badgeCountType="unread"`) + `NotificationFeedPopover`. `NotificationFeed` renders a full-page list.
- They need `import "@knocklabs/react/dist/index.css"`.
- Customization options: `--rnf-*` CSS variables, `colorMode="dark"`, replacing the whole CSS (every class starts with `rnf-`), `renderItem` to swap the cell, and `NotificationCell` children or an `avatar` prop.

**Tailwind interaction.** `@knocklabs/react@0.15.1` ships `dist/index.css`: 66 KB, 92 `--rnf-*` variables, and **no `@layer`**. Tailwind 4 puts utilities in `@layer utilities`, and unlayered CSS wins over layered CSS regardless of specificity. So Tailwind classes applied to `rnf-` elements lose _(inference from the CSS cascade rules)_. A possible workaround, `@import "@knocklabs/react/dist/index.css" layer(components);`, is undocumented _(inference)_.

The prebuilt components also pull in `@telegraph/*` (Knock's own design system), `@radix-ui/react-dialog`, `@popperjs/core`, and `lucide-react ^0.544.0` (from the npm `dependencies` of `@knocklabs/react@0.15.1`).

**Headless** ([docs](https://docs.knock.app/in-app-ui/react/headless/feed)):

```tsx
const knock = useKnockClient();
const feed = useNotifications(knock, FEED_CHANNEL_ID /*, { mode: "rich" } */);
const { items, metadata } = useNotificationStore(feed); // metadata.unseen_count / unread_count / total_count
useEffect(() => { feed.fetch(); }, [feed]);
```

- These hooks are all exported from `@knocklabs/react-core` (they are in its `index.mjs` exports): `useKnockClient`, `useNotifications`, `useNotificationStore`, `useFeedSettings`, `usePreferences`, `useTranslations`. The docs import them from `@knocklabs/react`, which re-exports them.
- Feed items carry `blocks[].rendered`, which is HTML rendered from the Knock template. The docs example renders it with `dangerouslySetInnerHTML`. Alternatively, use `item.data`, the trigger payload, and render Cadence-owned copy.
- **Headless means Cadence marks items seen itself.** Prebuilt popovers call `markAllAsSeen()` when opened; the hooks do not. Without that call, `unseen_count` never drops ([docs](https://docs.knock.app/in-app-ui/react/headless/feed#marking-items-as-seen)).

**Recommendation:** go headless. Use `@knocklabs/react-core` with a shadcn `Popover` and Tailwind, and skip the 66 KB of unlayered CSS and the Telegraph dependency tree.

## 2. SSR compatibility with React Router v8

Cadence runs with `ssr: true` (`react-router.config.ts`). Findings from the shipped source:

- `@knocklabs/react@0.15.1/dist/esm/index.mjs` begins with `"use client"`. That directive only matters under React Server Components. In React Router framework mode without RSC it does nothing, so these components **do render on the server** _(inference)_.
- `react-core@0.17.1` `modules/core/hooks/useAuthenticatedKnockClient.mjs` creates `new Knock(apiKey)` and calls `knock.authenticate(user, userToken)` inside `useMemo`, which runs **during the server render**.
- `client@0.23.1` `knock.mjs` `authenticate()`: with the default `identificationStrategy: "inline"` and a `user` **object**, it fires `this.user.identify(...)`, a network request, as fire-and-forget. **Every server render of a page under `KnockProvider` would therefore send an identify request from Node** _(inference from code)_.
- `useNotifications` (`modules/feed/hooks/useNotifications.mjs`) calls `feeds.initialize()` and `listenForUpdates()` in a `useState` initializer, which also runs during the server render. The socket itself is guarded: `client@0.23.1` `api.mjs` connects only when `typeof window !== "undefined" && typeof WebSocket !== "undefined"`. `feed.fetch()` sits in a `useEffect`, so it runs only on the client.

**Mitigation:** both settings below are documented `KnockProvider` props ([KnockProvider reference](https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider)).

- Pass `enabled={hydrated}`, where `hydrated` is `false` on the server and `true` after mount. With `enabled={false}` the client stays idle: no identify call, no API requests, no websocket.
- Also pass `identificationStrategy="skip"`, and identify Students from the server instead (section 3).

The feed renders empty on the server and fills in after hydration. That is acceptable for a bell.

## 3. Identifying Cadence Students in Knock

[Docs](https://docs.knock.app/managing-recipients/identifying-recipients):

- **Every identify is an upsert** that merges data. `id` is the only required field, and the docs recommend your internal user ID. Use the Student's Cadence ID.
- Reserved properties: `name`, `email`, `avatar`, `locale`, `phone_number`, `timezone`, `created_at`. Custom properties may total at most 256 kB.
- Server: `knock.users.update(studentId, { name, email })` (`@knocklabs/node@1.41.1` `resources/users/users.d.ts`). This maps to `PUT /v1/users/{id}`.
- Inline in a trigger: a recipient given as an **object** (`{ id, name }`) is identified before the workflow runs. A recipient given as a bare string is not identified.
- Client-side identification exists (the `KnockProvider` `user` prop). The docs advise using server-side identification for anything beyond basic data. This fits the `identificationStrategy="skip"` approach from section 2.

## 4. Triggering workflows from Node

`@knocklabs/node@1.41.1` (`resources/workflows.d.ts`):

```ts
import Knock from "@knocklabs/node";
const knock = new Knock(); // reads KNOCK_API_KEY; KNOCK_BASE_URL overrides https://api.knock.app
await knock.workflows.trigger("lesson-released", {
  recipients: [{ id: student.id, name: student.name }], // inline identify
  data: { courseId, lessonTitle },
  // actor, tenant, cancellation_key also available
  // settings: { sandbox_mode, skip_delay }
});
```

- Workflow runs execute asynchronously. Trigger returns a `workflow_run_id`.
- `new Knock()` **throws** when no API key is set: "The KNOCK_API_KEY environment variable is missing or empty…" (`client.js`). So, like the mailer, construct it only when a key is present.
- The workflow, its in-app channel step and its template live in the Knock dashboard or CLI. They are not in Cadence's repo.

## 5. Client feed auth: signed user tokens

[Docs](https://docs.knock.app/in-app-ui/security-and-authentication):

- **Enhanced security mode is off by default.** While it is off, the public key can authenticate as **any** user ID, so anyone who knows or guesses a Student ID can read that Student's feed. **It must be on in production.** It can stay off in a development environment.
- The token is an RS256 JWT with `sub` (the user ID) and recommended `iat` and `exp` claims. `grants` and `explicit_grants` can narrow access.
- Sign it on the server with `signUserToken(studentId, { expiresInSeconds })` from `@knocklabs/node/lib/tokenSigner`. The signing key defaults to `process.env.KNOCK_SIGNING_KEY`, accepts PEM or base64, and the default lifetime is 3600 s (`tokenSigner.d.ts`).
- Pass the token as `userToken` to **`KnockProvider`**.
  - The feed doc says to pass it to `KnockFeedProvider`, but that is stale: `KnockFeedProviderProps` in `react-core@0.17.1` has no `userToken`, while `KnockProviderProps` does.
- Refresh it with `onUserTokenExpiring` / `timeBeforeExpirationInMs` on `KnockProvider`. The docs suggest matching the token lifetime to the session lifetime.

Cadence wiring:

1. The root loader signs the token for the session Student and returns it next to the public key and feed channel ID.
2. `onUserTokenExpiring` fetches a fresh token from a resource route.

## 6. Read, seen and archived state

Engagement statuses ([docs](https://docs.knock.app/send-notifications/message-statuses)) are timestamps:

| Status | Field | Set when |
| --- | --- | --- |
| seen | `seen_at` | The Notification was fetched for display |
| read | `read_at` | The Student read it |
| interacted | `interacted_at` | The Student clicked the cell |
| link_clicked | `link_clicked_at` | The Student clicked a link |
| archived | `archived_at` | The Student archived it |

For in-app feeds, seen, interacted and archived are managed implicitly by the SDK.

The feed client (`client@0.23.1` `clients/feed/feed.d.ts`) has all the mark methods:

- `markAsSeen` and `markAllAsSeen`, with `markAsUnseen`
- `markAsRead` and `markAllAsRead`, with `markAsUnread`
- `markAsInteracted`
- `markAsArchived`, `markAllAsArchived` and `markAllReadAsArchived`, with `markAsUnarchived`

Feed options: `status: "unread" | "read" | "unseen" | "seen" | "all"` and `archived: "include" | "exclude" | "only"`. Feed metadata returns `total_count`, `unread_count` and `unseen_count` for badges ([api-overview](https://docs.knock.app/in-app-ui/api-overview)). State lives in Knock, so **Cadence's SQLite stores no Notification state**.

## 7. Real-time delivery

- Knock runs a managed websocket. The `new-message` event carries badge-count metadata, not the content, and "might be throttled" ([api-overview](https://docs.knock.app/in-app-ui/api-overview#real-time-delivery)).
- The SDK manages the connection lifecycle and reconnects ([socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior)).
  - It disconnects hidden tabs after `auto_manage_socket_connection_delay`, 2000 ms by default.
  - An experimental `__experimentalCrossBrowserUpdates` option uses BroadcastChannel to sync tabs.
- Client events: `items.received.realtime`, `items.received.page`, `items.read`, `items.seen`, `items.archived`, `items.*` (`clients/feed/types.d.ts`). `feed.on("items.received.realtime", …)` is the hook for a toast.
- No server-side polling or SSE is needed in Cadence.

## 8. Free plan limits (formerly "Developer")

Sources: [pricing](https://knock.app/pricing) and [plans and usage](https://docs.knock.app/manage-your-account/knock-plans). The Free plan is the plan formerly called Developer.

- **10,000 messages a month.** A message is one successful delivery to one recipient on one channel, so in-app plus email for one Student counts twice.
- Knock doesn't hard-cap usage. If you go over, Knock contacts you about billing the following month.
- Usage accrues in **every environment**, development included.
- Unlimited environments, workflows, seats and feeds. The Free plan includes the Feed API, prebuilt components, and bring-your-own components.
- Knock branding can't be removed on Free (pricing page). It shows in Knock's prebuilt UI _(inference)_; a headless UI shows none.
- Retention: in-app feed items are kept **indefinitely**. Message logs are kept 30 days on non-Enterprise plans ([data retention](https://docs.knock.app/manage-your-account/data-retention)).
- Next tier: Starter, $250/month, including 50k messages, then $0.005 per message.
- Template translations (i18n) are Enterprise-only.
- Rate limits are tiered per endpoint, from 1 to 1,000 requests/s, and return 429 when exceeded. With signed user tokens, limits are scoped per environment **and** per user ([rate limits](https://docs.knock.app/api-reference/overview/rate-limits)). I did not look up the tier of each endpoint.
- **EU data residency is "expected by end of 2026"** and is not available today ([plans page](https://docs.knock.app/manage-your-account/knock-plans)). This matters if Students' names and emails must stay in the EU.

## 9. No-keys and test story

**What Knock offers:**

- **Environments.** Each has its own keys and data ([docs](https://docs.knock.app/concepts/environments)).
- **Workflow test runner** in the dashboard and `knock workflow run` in the CLI ([testing workflows](https://docs.knock.app/send-notifications/testing-workflows)).
- **Sandbox mode.** It renders messages without delivering them, and sandboxed messages don't count toward usage.
  - **Contradiction:** the [integrations overview](https://docs.knock.app/integrations/overview#sandbox-mode) says sandbox mode is supported on all channel types **except in-app**. The trigger API's `settings.sandbox_mode` says it applies to "all channels in this workflow run".
  - Not resolved here. Until it is verified, assume **in-app sends in development count toward usage**.
- **What Knock does not offer:** a local emulator, a mock server, or an official test double. I checked the docs index (`docs.knock.app/llms.txt`) and the testing pages.

**Recommended pattern** (mirrors `app/lib/mailer.server.ts`):

- **Server.** A `NotificationTransport` interface with a `knockTransport(apiKey)` implementation, used when `KNOCK_API_KEY` is set. When it isn't, fall back to a local transport, for example writing JSON to a `.notifications/` folder the way the mailer writes to `.outbox/`, or a no-op.
  - Vitest uses an in-memory fake and never calls Knock.
  - Constructing the transport only when a key exists also avoids `new Knock()` throwing.
- **Client.** When the loader has no public key, render the bell with `enabled={false}`, or don't render it at all.
  - The `Knock` constructor accepts an empty key and only throws on `sk_` keys (`client@0.23.1` `knock.mjs`), so a missing key would surface later as failed requests.
  - `enabled={false}` keeps the client idle.
- **Without a Knock account, a developer can't see a real feed.** For local UI work, the headless feed component should take `items` as props so it can be rendered with fixtures in tests and dev. Only a thin wrapper should call the Knock hooks _(design suggestion)_.

## Key facts later decisions depend on

- **Component choice:** headless `@knocklabs/react-core@0.17.1` with shadcn and Tailwind. The prebuilt CSS is unlayered and fights Tailwind 4. Cadence must call `markAllAsSeen` itself.
- **SSR:** `KnockProvider enabled={hydrated} identificationStrategy="skip"`. Otherwise every server render sends an identify request from Node.
- **Identity:** Knock user id = Cadence Student id. Upsert with `users.update` or inline in the trigger's `recipients: [{ id, ... }]`.
- **Auth model:** enhanced security on in production. The root loader signs an RS256 token with `signUserToken` using `KNOCK_SIGNING_KEY`, and passes it to `KnockProvider` as `userToken`. Refresh with `onUserTokenExpiring`.
- **State:** seen, read, archived and the counts all live in Knock. Cadence stores no Notification state.
- **Test story:** a transport seam like the mailer's. No Knock calls in Vitest. Knock has no emulator, and in-app sandbox support is contradictory in the docs.
- **Limits:** 10k messages a month on Free, counted in every environment, no hard cap. Starter is $250/month. No EU data residency yet.
- **Secrets:** server `KNOCK_API_KEY` and `KNOCK_SIGNING_KEY`. Client gets the public key and `KNOCK_FEED_CHANNEL_ID`.
