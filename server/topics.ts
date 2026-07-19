import { db } from "./db";
import { synthesizeChapterTopics, type SynthesisInputCard } from "./topicSynthesis";

interface ChapterRow {
  id: number;
  title: string;
  topics_synthesized: number;
}

export async function synthesizeTopicsForChapter(chapterId: number, force = false): Promise<{ topicCount: number; skipped: boolean }> {
  const chapter = db.prepare("SELECT * FROM chapters WHERE id = ?").get(chapterId) as ChapterRow | undefined;
  if (!chapter) throw new Error("Chapter not found.");

  if (chapter.topics_synthesized && !force) {
    const existingCount = (db.prepare("SELECT COUNT(*) as n FROM topics WHERE chapter_id = ?").get(chapterId) as { n: number }).n;
    return { topicCount: existingCount, skipped: true };
  }

  const cards = db
    .prepare("SELECT id, label as topic, source_locator, source_passage FROM concepts WHERE chapter_id = ? ORDER BY order_index ASC")
    .all(chapterId) as Array<{ id: number; topic: string; source_locator: string; source_passage: string }>;

  const input: SynthesisInputCard[] = cards.map((card) => ({
    id: card.id,
    topic: card.topic,
    question: card.topic, // the raw concepts table doesn't keep the original question separately from the label at this layer
    answer: card.source_passage,
    sourcePages: card.source_locator.replace(/^Ch\.\s*\d+,\s*pp?\.\s*/, ""),
  }));

  const synthesized = await synthesizeChapterTopics(chapter.title, input);

  const insertTopic = db.prepare("INSERT INTO topics (chapter_id, label, thesis, source_locator, order_index) VALUES (?, ?, ?, ?, ?)");
  const insertSourceCard = db.prepare("INSERT OR IGNORE INTO topic_source_cards (topic_id, concept_id) VALUES (?, ?)");
  const clearOldTopics = db.prepare("DELETE FROM topics WHERE chapter_id = ?");
  const markSynthesized = db.prepare("UPDATE chapters SET topics_synthesized = 1 WHERE id = ?");

  const persist = db.transaction(() => {
    if (force) clearOldTopics.run(chapterId);
    synthesized.forEach((topic, index) => {
      const validCardIds = topic.sourceCardIds.filter((id) => cards.some((c) => c.id === id));
      const pages = validCardIds
        .map((id) => cards.find((c) => c.id === id)?.source_locator ?? "")
        .filter(Boolean)
        .join("; ");
      const info = insertTopic.run(chapterId, topic.label, topic.thesis, pages || `Ch. ${chapter.title}`, index);
      const topicId = info.lastInsertRowid as number;
      for (const cardId of validCardIds) insertSourceCard.run(topicId, cardId);
    });
    markSynthesized.run(chapterId);
  });

  persist();
  return { topicCount: synthesized.length, skipped: false };
}
