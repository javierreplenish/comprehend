# Comprehend — engine checkpoint

This has a **real UI now** - Library, Study Path, and Session are all built and
wired to the verified engine. The curl-testing section below still works if
you want to test the raw API, but you can now just click through it.

## What's verified vs. what needs your key

**Verified in this environment, with real tests (not just type-checking):**
- `tsc --noEmit` and `vite build` both pass clean for the full app (server + client)
- The scheduler (`server/scheduler.ts`) was tested with five real scenarios -
  first clean completion, streak growth, struggled completion, an incomplete
  session, and the interval cap - all producing the correct numbers
- Auth, seeding, and every route the UI calls were exercised against a real
  running server end-to-end: signup, seed, list books/chapters/concepts - all
  return exactly the shape the client expects
- **A real bug was caught and fixed while wiring up the client**: `startSession`
  and the narrow/advance branch of `respondToTurn` weren't returning the new
  turn's id, which would have made it impossible for the UI to know which turn
  to submit the next answer to. Confirmed fixed and re-verified.
- The missing-API-key path fails with a clean error instead of crashing

**Needs your `ANTHROPIC_API_KEY` to verify - I don't have one in this
sandbox:** the actual dialogue engine (`server/dialogue.ts`). Everything
around it is tested; whether the model's *judgment* is actually good - does
it correctly narrow instead of advance on a weak answer, does it avoid
repeating prior question wording on a restart, does the hint stay a nudge and
not an answer - is the one thing only a real run can tell you.

## Setup

```bash
npm install
cp .env.example .env
# add your ANTHROPIC_API_KEY, and set SESSION_SECRET to a long random string
npm run dev
```

Open **http://localhost:5173**. Sign up, click "+ Load sample book" - this
imports the real, complete deck: all 31 chapters and all 1,480 raw
flashcards, verified to match exactly. Open the book, and you'll see each
chapter is unsynthesized at first - click "Synthesize this chapter's topics"
to run the AI synthesis call (needs your API key) that reads that chapter's
flashcards and surfaces the actual handful of ideas the author argues, each
grounded in at least two real flashcards. Once synthesized, "Review" starts
a real dialogue session on a topic, or "Flashcards" browses the raw deck for
that chapter untouched.

## Staying signed in

Sessions used to live only in server memory - restarting `npm run dev`
(which happens constantly in local dev) silently signed everyone out even
though the cookie itself was still valid for 30 days. Fixed: sessions now
persist in a `sessions` table inside the same `data.db` file everything
else already uses. Verified with a real test, not assumed: signed up, killed
the server process entirely, started a fresh one, and confirmed the same
browser cookie was still authenticated against the new process.

## The two-tier content model

- **Flashcards** (`concepts` table, unchanged) - all 1,480, pure reference
  material for Flashcard Lab. Never touched by progress tracking or the AI.
- **Topics** (`topics` table, new) - AI-synthesized per chapter from that
  chapter's flashcards, typically 6-10 per chapter depending on real content
  (never a fixed count). This is what Study Path and Session actually work
  through. Each topic keeps `topic_source_cards` linking back to the
  specific flashcards it was built from, so a learner can always see the
  real source excerpts behind an AI synthesis, not just trust the paraphrase.
- Synthesis is **per-chapter and on-demand**, not automatic at seed time -
  seeding the raw deck needs no API key; synthesizing needs one, and costs a
  real AI call per chapter you choose to synthesize.

## Testing the engine directly (still works, if you want the raw API)

There's no UI to click through yet, so test with curl. This walks through:
sign up, seed one real test concept ("Bases of power," the one from all the
mockups), start a session, and answer the first question.

```bash
# 1. Sign up (cookie saved to ck.txt for the following requests)
curl -s -c ck.txt -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'

# 2. Seed two real test chapters/concepts:
#    - Ch. 1, concept id 1: "Bases of power"
#    - Ch. 2, concept id 2: "Ethnic resources (Light and Bonacich)"
curl -s -b ck.txt -X POST http://localhost:8787/api/dev/seed

# 3. List chapters, then concepts, to find the concept id (should be 1)
curl -s -b ck.txt http://localhost:8787/api/books/1/chapters
curl -s -b ck.txt http://localhost:8787/api/chapters/1/concepts

# 4. Start a dialogue session on that concept - this is the first real AI call
curl -s -b ck.txt -X POST http://localhost:8787/api/concepts/1/sessions
# Returns: { sessionId, dimension: "clarify", attemptNumber: 1, questionText, introText }
# Note the sessionId and the turn id from the dialogue_turns table (or just
# use 1 for a fresh db) for the next step.

# 5. Answer it - try a genuinely weak answer first, to check narrowing works
curl -s -b ck.txt -X POST http://localhost:8787/api/sessions/1/turns/1/respond \
  -H "Content-Type: application/json" \
  -d '{"answerText":"Power just means being in charge."}'
# Should come back with action "ask_question", SAME dimension (clarify),
# attemptNumber 2, and a narrower question - not an "advance."

# 6. Try requesting a hint instead of answering
curl -s -b ck.txt -X POST http://localhost:8787/api/sessions/1/turns/2/respond \
  -H "Content-Type: application/json" \
  -d '{"hintRequested":true}'
# Should come back with action "give_hint" and a nudge, not the passage or answer.
```

What to actually check across a few runs:
- Does a genuinely strong answer advance to the next dimension?
- Does a weak answer at attempt 3 trigger `offer_passage` instead of another narrow?
- If you fail even after the passage, does it `mark_incomplete` with warm,
  non-shaming language - never "wrong" or "failed"?
- After an incomplete session, start a new session on the same concept - are
  the new questions genuinely different from last time, not just reworded?

## Data model

See `src/types.ts` for the full shape - it's the single source of truth for
every rule from the design conversation (dimension order, attempt limits,
the five `DialogueAction` variants). `server/db.ts` is the SQLite schema;
`server/scheduler.ts` is the pure spaced-repetition math (no AI);
`server/dialogue.ts` is the one AI call in the whole product;
`server/sessions.ts` is the state machine tying all three together.

## Known gaps, honestly

- **No upload pipeline yet.** Content is seeded manually (`server/seed.ts`)
  with one real concept. Turning an uploaded book into chapters/concepts is
  a separate, larger piece - the file-type and processing-time questions
  from earlier are still open.
- **No UI.** `src/App.tsx` is a placeholder. Library/Study Path/Session
  come next, once the engine's actual judgment quality is confirmed with a
  real key.
- **Session store is in-memory** (Express default) - fine for local dev,
  not for anything real. Same caveat as the last project.
