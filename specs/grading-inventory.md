# Grading Inventory (#3)

**Question:** for each question / facet type, does a deterministic grading path exist (exact match, choice, kana-normalize) or does grading *require* an AI call? This decides free-tier degradation options.
**Method:** static read of the review flow — backend `reviews.service.ts` + frontend `app/review/page.tsx` and the review card components. Inferences labeled.

## Grading architecture (three layers)

There is **no multiple-choice grading anywhere** — every item is free-text or drag-assembly. Grading passes through up to three layers; the first that resolves wins:

1. **Client-side deterministic** — some facet types compare the answer in-browser and never call the evaluate endpoint on a match.
2. **Backend deterministic pre-check** — `POST /reviews/evaluate` → `ReviewsService.evaluateAnswer` normalizes (lowercase + strips trailing JP/ASCII punctuation) and does exact-match against `expectedAnswers` **before** any model call (`reviews.service.ts:284`). A match returns `pass` with no AI.
3. **AI fallback** — only reached when layers 1–2 miss: `GeminiService.evaluateAnswer` (`gemini.service.ts:44`) judges semantic equivalence.

So AI grading is a *fallback for near-misses/paraphrases*, not the default for every answer.

## Per-facet-type grading (SRS review facets)

`FacetType` defined at `types/index.ts:428`. Frontend dispatch in `app/review/page.tsx`.

| Facet type | How graded | AI required? | Notes |
|---|---|---|---|
| `sentence-assembly` | Client-side: joined fragments vs `answer` (+ normalized + `accepted_alternatives`) (`SentenceAssemblyCard.tsx:68`) → `PUT /reviews/facets/:id` | **No — never** | Fully deterministic; result posted directly. |
| `sentence-cloze` | Client-side: `answer.trim()` exact match against accepted list (`SentenceClozeCard.tsx:49`) | **No — never** | Fully deterministic. |
| `Content-to-Reading` | Client-side kana-normalize (wanakana→hiragana) exact match (`review/page.tsx:394`); miss → `/reviews/evaluate` | **No on match**; AI only on miss | Kana answers resolve without AI. |
| `Kanji-Component-Reading` | same kana short-circuit as above | **No on match**; AI only on miss | |
| `Kanji-Component-Meaning` | `/reviews/evaluate` → backend exact-match, AI fallback | Deterministic on exact match; AI for synonyms | Meaning strings split on delimiters (`page.tsx:686`). |
| `Content-to-Definition` | `/reviews/evaluate` | Deterministic on exact; AI for paraphrase | English meaning — wording varies → AI often used. |
| `Definition-to-Content` | `/reviews/evaluate` | Deterministic on exact; AI for near-miss | Answer is the JP content. |
| `Reading-to-Content` | `/reviews/evaluate` | Deterministic on exact; AI for near-miss | |
| `audio` | `/reviews/evaluate` (type the English meaning) | Deterministic on exact; AI for paraphrase | Audio itself is TTS (`/audio/speak`), separate from grading. |
| `AI-Generated-Question` | `/reviews/evaluate` against generated `answer` + `accepted_alternatives` | **Usually AI** | Free-text translation/correction answers — exact-match rarely hits; see below. |

## Per-generated-question-type (content inside `AI-Generated-Question`)

These are the templates the generator produces (`prompts/quiz.prompts.ts`). All produce a free-text answer plus `accepted_alternatives`; all grade through `/reviews/evaluate` (deterministic exact-match → AI fallback).

| Group / type | Answer shape | Deterministic-gradable? |
|---|---|---|
| Vocab `conjugation` | single conjugated form | **Yes, cleanly** — finite correct form; exact-match viable |
| Vocab / Noun `particle`, `noun-particle`, `fill-in-the-blank` | particle / short blank fill | **Mostly** — small answer set; exact-match + alternatives usually enough |
| Vocab / Noun `translation` | full JP sentence from English | **No** — many valid phrasings; needs AI for paraphrase |
| Grammar / Concept `novel-translation` | full JP sentence | **No** — same as translation |
| Grammar / Concept `error-correction` | corrected JP sentence | **No** — multiple valid corrections; needs AI |

## Bottom line for free-tier degradation

- **Never needs AI (safe for a no-AI free tier as-is):** `sentence-assembly`, `sentence-cloze`, and reading facets (`Content-to-Reading`, `Kanji-Component-Reading`) — all graded deterministically client-side.
- **Deterministic-capable with tighter authored answers:** `conjugation`, particle/fill-in-the-blank, `Kanji-Component-Meaning`, and other short-answer facets pass on exact-match today; they only fall to AI on wording variance. A curated `accepted_alternatives` set (or a stricter free-tier grader) could remove the AI dependency.
- **Genuinely need AI to grade fairly:** any free-text `translation`, `novel-translation`, or `error-correction` answer — paraphrase acceptance is the whole point, and exact-match would produce false-negatives. For a free tier these must either be (a) pre-graded from a static answer pool, (b) restricted to authored single-answer variants, or (c) excluded. *(Design decision — yours, not stated here.)*

## Cross-reference
- The AI fallback endpoint and its auth posture are catalogued as #1 in `ai-endpoints.md` (gated by `FirebaseAuthGuard` only — no tier check).
