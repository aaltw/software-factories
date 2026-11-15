import { and, desc, eq } from "drizzle-orm";
import { courses, lessons, modules, notes } from "~/db/schema";
import type { Db } from "~/lib/comments.server";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

// ─── Notes ───
// A Student's own plain-text writing about a Lesson, private to them. One per
// Student per Lesson. See GLOSSARY.md.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

type Note = typeof notes.$inferSelect;

export type SaveNoteResult =
  { ok: true; note: Note } | { ok: false; error: string };

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

/**
 * Creates the Student's Note on a Lesson, or replaces its body and moves
 * `updatedAt` on. `createdAt` stays put on a re-save.
 */
export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Write something before saving." };
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: "A note can be at most 2,000 characters." };
  }

  const at = now.toISOString();

  const note = db
    .insert(notes)
    .values({ userId, lessonId, body: trimmed, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: at },
    })
    .returning()
    .get();

  return { ok: true, note };
}

/**
 * The Student's Notes for the Saved page, last edited first, each with the
 * Lesson and Course it belongs to.
 */
export function listNotes(db: Db, userId: number) {
  return db
    .select({
      id: notes.id,
      body: notes.body,
      updatedAt: notes.updatedAt,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();
}
