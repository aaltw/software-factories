import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import {
  isBookmarked,
  listBookmarks,
  toggleBookmark,
} from "./bookmarks.server";

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

  moduleId = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get().id;

  lessonId = addLesson("Lesson 1", 1);
});

function addLesson(title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get().id;
}

describe("toggling a Bookmark", () => {
  it("bookmarks a Lesson that has no Bookmark", () => {
    expect(toggleBookmark(db, base.user.id, lessonId, NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(true);
  });

  it("removes the Bookmark when toggled again", () => {
    toggleBookmark(db, base.user.id, lessonId, NOW);

    expect(toggleBookmark(db, base.user.id, lessonId, LATER)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonId)).toBe(false);
  });

  it("never leaves two Bookmarks on one Lesson", () => {
    toggleBookmark(db, base.user.id, lessonId, NOW);
    toggleBookmark(db, base.user.id, lessonId, NOW);
    toggleBookmark(db, base.user.id, lessonId, NOW);

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });
});

describe("listing a Student's Bookmarks", () => {
  it("lists only that Student's Bookmarks, newest first, with Lesson and Course", () => {
    const otherLessonId = addLesson("Lesson 2", 2);
    const otherStudent = db
      .insert(schema.users)
      .values({
        name: "Sam",
        email: "sam@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();

    toggleBookmark(db, base.user.id, lessonId, NOW);
    toggleBookmark(db, base.user.id, otherLessonId, LATER);
    toggleBookmark(db, otherStudent.id, lessonId, LATER);

    expect(listBookmarks(db, base.user.id)).toEqual([
      expect.objectContaining({
        lessonId: otherLessonId,
        lessonTitle: "Lesson 2",
        courseTitle: "Test Course",
        courseSlug: "test-course",
      }),
      expect.objectContaining({ lessonId, lessonTitle: "Lesson 1" }),
    ]);
  });
});
