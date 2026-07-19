import { db } from "./db";
import { chapters as bookChapters, flashcards } from "./bookData";

const BOOK_TITLE = "Blueprint for Black Power";
const BOOK_AUTHOR = "Amos N. Wilson";

export function seedTestContent(userId: number): number {
  const existing = db.prepare("SELECT id FROM books WHERE uploaded_by_user_id = ? AND title = ?").get(userId, BOOK_TITLE) as { id: number } | undefined;
  if (existing) return existing.id;

  const bookId = db.prepare("INSERT INTO books (title, author, status, uploaded_by_user_id) VALUES (?, ?, 'ready', ?)").run(BOOK_TITLE, BOOK_AUTHOR, userId)
    .lastInsertRowid as number;

  const insertChapter = db.prepare("INSERT INTO chapters (book_id, number, title, summary, order_index) VALUES (?, ?, ?, ?, ?)");
  const insertConcept = db.prepare("INSERT INTO concepts (chapter_id, label, question, source_locator, source_passage, order_index) VALUES (?, ?, ?, ?, ?, ?)");

  const importAll = db.transaction(() => {
    const chapterIdByNumber = new Map<number, number>();

    bookChapters.forEach((chapter, index) => {
      const summary = `pp. ${chapter.pages} \u00b7 ${chapter.cardCount} concepts`;
      const info = insertChapter.run(bookId, chapter.number, chapter.title, summary, index);
      chapterIdByNumber.set(chapter.number, info.lastInsertRowid as number);
    });

    let orderInChapter = new Map<number, number>();
    for (const card of flashcards) {
      const chapterId = chapterIdByNumber.get(card.chapterNumber);
      if (!chapterId) continue;
      const order = orderInChapter.get(card.chapterNumber) ?? 0;
      orderInChapter.set(card.chapterNumber, order + 1);
      insertConcept.run(chapterId, card.topic, card.question, `Ch. ${card.chapterNumber}, pp. ${card.sourcePages}`, card.answer, order);
    }
  });

  importAll();
  return bookId;
}
