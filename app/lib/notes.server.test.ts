import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { getNote, listNotes, saveNote } from "./notes.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const LATER = new Date(2026, 9, 7, 9, 30, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let moduleId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  moduleId = module.id;

  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
});

describe("saving a Note", () => {
  it("creates the Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonId,
      "  # not a heading  ",
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "# not a heading",
      updatedAt: NOW.toISOString(),
    });
  });
});

describe("the Note length cap", () => {
  it("accepts a Note of exactly 2,000 characters", () => {
    const result = saveNote(db, base.user.id, lessonId, "a".repeat(2000), NOW);

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonId)?.body).toHaveLength(2000);
  });

  it("refuses a Note over 2,000 characters and stores nothing", () => {
    const result = saveNote(db, base.user.id, lessonId, "a".repeat(2001), NOW);

    expect(result).toEqual({
      ok: false,
      error: "A note can be at most 2,000 characters.",
    });
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });

  it("measures the cap after trimming", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonId,
      `  ${"a".repeat(2000)}  `,
      NOW
    );

    expect(result.ok).toBe(true);
  });

  it("refuses an empty Note", () => {
    const result = saveNote(db, base.user.id, lessonId, "   ", NOW);

    expect(result).toEqual({
      ok: false,
      error: "Write something before saving.",
    });
    expect(getNote(db, base.user.id, lessonId)).toBeUndefined();
  });
});

describe("saving a Note again", () => {
  it("replaces the body and moves the last-edited time on, keeping one Note", () => {
    saveNote(db, base.user.id, lessonId, "first thoughts", NOW);
    saveNote(db, base.user.id, lessonId, "second thoughts", LATER);

    expect(getNote(db, base.user.id, lessonId)).toMatchObject({
      body: "second thoughts",
      createdAt: NOW.toISOString(),
      updatedAt: LATER.toISOString(),
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });
});

describe("listing a Student's Notes", () => {
  it("lists only that Student's Notes, last edited first, with Lesson and Course", () => {
    const otherLessonId = db
      .insert(schema.lessons)
      .values({ moduleId, title: "Lesson 2", position: 2 })
      .returning()
      .get().id;
    const otherStudent = db
      .insert(schema.users)
      .values({
        name: "Sam",
        email: "sam@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    saveNote(db, base.user.id, lessonId, "older", NOW);
    saveNote(db, base.user.id, otherLessonId, "newer", LATER);
    saveNote(db, otherStudent.id, lessonId, "not mine", LATER);

    expect(listNotes(db, base.user.id)).toEqual([
      expect.objectContaining({
        body: "newer",
        lessonId: otherLessonId,
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ body: "older", lessonTitle: "Lesson 1" }),
    ]);
  });
});
