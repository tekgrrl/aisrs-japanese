# Coverage Checklist (#1)

**Purpose:** enumerate the full feature surface — one row per feature. Columns: **feature**, **entry points**, **touches AI** (yes/no), **harness-covered** (all "not yet" for now). No judgments; this is the surface map that the harnesses will later claim coverage against. Cross-refs: `ai-endpoints.md` (#2), `grading-inventory.md` (#3).

Legend — touches AI: **Y** = a model call is on the path; **N** = deterministic; **Y(gen)/N(grade)** = AI generates the content but grading is deterministic.

## 1. Review facet types (SRS item taxonomy)
`FacetType` (`backend/src/types/index.ts:428`); presentation/grading dispatch in `frontend/src/app/review/page.tsx`.

| Feature (facet) | Entry points | Touches AI | Harness |
|---|---|---|---|
| Content-to-Definition | review page → `POST /reviews/evaluate` | Y (grade fallback) | not yet |
| Definition-to-Content | same | Y (grade fallback) | not yet |
| Content-to-Reading | review page (client kana-match) → `/reviews/evaluate` | N(match)/Y(miss) | not yet |
| Reading-to-Content | `/reviews/evaluate` | Y (grade fallback) | not yet |
| Kanji-Component-Meaning | `/reviews/evaluate` | Y (grade fallback) | not yet |
| Kanji-Component-Reading | review page (client kana-match) | N(match)/Y(miss) | not yet |
| audio | `/reviews/evaluate` + `POST /audio/speak` (TTS) | Y (grade + TTS) | not yet |
| AI-Generated-Question | `GET /questions/generate` → `/reviews/evaluate` | Y | not yet |
| sentence-assembly | `SentenceAssemblyCard` → `PUT /reviews/facets/:id` | N (grade); Y(gen) content | not yet |
| sentence-cloze | `SentenceClozeCard` → `PUT /reviews/facets/:id` | N (grade); Y(gen) cloze | not yet |

## 2. Generated question types (templates for `AI-Generated-Question`)
`backend/src/prompts/quiz.prompts.ts`; generation in `questions.service.ts` (pool-reuse first, AI on miss).

| Feature (question type) | Entry points | Touches AI | Harness |
|---|---|---|---|
| Vocab · conjugation | `generateVocabQuestion` | Y (gen) | not yet |
| Vocab · particle | `generateVocabQuestion` | Y (gen) | not yet |
| Vocab · translation | `generateVocabQuestion` | Y (gen) | not yet |
| Vocab · fill-in-the-blank | `generateVocabQuestion` | Y (gen) | not yet |
| Noun · noun-particle | `generateVocabQuestion` (few-shot) | Y (gen) | not yet |
| Noun · translation | `generateVocabQuestion` | Y (gen) | not yet |
| Grammar · novel-translation | `generateGrammarQuestion` | Y (gen) | not yet |
| Grammar · error-correction | `generateGrammarQuestion` | Y (gen) | not yet |
| Concept · error-correction | `generateConceptQuestion` | Y (gen) | not yet |
| Concept · novel-translation | `generateConceptQuestion` | Y (gen) | not yet |

## 3. SRS behaviors
Mostly `reviews.service.ts` / `review-progress.service.ts` / `stats.service.ts`.

| Feature | Entry points | Touches AI | Harness |
|---|---|---|---|
| Stage progression (shodo 0–8: Sumi-suri/Kaisho/Gyosho/Sosho/Mushin) | `reviews.service.calculateNextStage:242` | N | not yet |
| Interval scheduling (`INTERVALS[stage]` → `nextReviewAt`; `SRS_TEST_MODE` env) | `reviews.service:43,122` | N | not yet |
| Fail-reset paths (per approved transition table) | `calculateNextStage:247` | N | not yet |
| Leech detection (consecutiveFailures ≥ 3 → `addToLeechVocab`) | `reviews.service:206`, `stats.service` | N | not yet |
| Self-certified facets (start at stage 6) | `reviews.service:409`; `generateReviewFacets` | N | not yet |
| Mastery (`MASTERED_STAGE=7`) + level progress | `constants.ts:8`; `UserRoot.stats.levelProgress` | N | not yet |
| Facet unlock sequencing | `review-progress.service.initializeSequence`; `POST /reviews/initialize-sequence` | Y (cloze on audio facets) | not yet |
| Question pool reuse + rank (threshold 30, deltas, rejection) | `questions.service.findSuitableQuestion:131` | N | not yet |
| Question feedback (keep / request-new / report) | `PATCH /questions/:id/feedback` | N | not yet |
| Due-review selection | `GET /reviews/facets?due=true`; `getDueReviews` | N | not yet |
| Daily plan generation | `POST /daily-plan/check`; `daily-plan.service` | N (inference) | not yet |
| Stats: forecast / hourly forecast / streak | `GET /stats`; `UserRoot.stats` | N | not yet |

## 4. Generation / AI paths
Condensed — full detail (client trigger → endpoint → model → guard) in `ai-endpoints.md`. All touch AI (Y).

| Feature | Entry point | Harness |
|---|---|---|
| Lesson generation | `POST /lessons/generate`, `/lessons/batch`, `/lessons/regenerate/:kuId` | not yet |
| Question generation (pool-first) | `GET /questions/generate` | not yet |
| Scenario generation | `POST /scenarios/generate`, `/scenarios/import` | not yet |
| Scenario chat turn | `POST /scenarios/:id/chat` | not yet |
| Scenario evaluation | `generateEvaluation` (via chat/advance) | not yet |
| Concept generation | `POST /concepts/generate` | not yet |
| Kanji details (AI fallback) | `GET /kanji/details` | not yet |
| Cloze sentence generation | audio-facet creation (`reviews`/`review-progress`) | not yet |
| Content validation (QA) | internal, post-generation (`validation.service`) | not yet |
| Context caching | `lessons.service` → `createContextCache` | not yet |
| Tutor scenario builder | `POST /tutor/generate-scenario` | not yet |
| Answer evaluation (grade fallback) | `POST /reviews/evaluate` | not yet |
| Prompt tester (unguarded) | `POST /apilogs/prompt-test` | not yet |

## 5. Other feature surfaces (non-AI or supporting)

| Feature | Entry points | Touches AI | Harness |
|---|---|---|---|
| Text-to-speech (audio) | `POST /audio/speak` (Google TTS) | N (not LLM; paid) | not yet |
| Kanji details lookup (stored) | `GET /kanji/details` | N (unless fallback) | not yet |
| Knowledge-units CRUD / admin | `GET/POST /knowledge-units` (+ `AdminGuard` routes); `/admin/knowledge-units` | N | not yet |
| Concepts browse / library | `GET /concepts`, `/concepts/:id`; `/concepts`, `/concepts/library` | N | not yet |
| User-concepts enrollment | `user-concepts.controller`; `/concepts` | N | not yet |
| Scenarios browse / manage | `GET /scenarios…`; `/scenarios`, `/manage/scenarios` | N | not yet |
| Learn flow (KU lesson view/session) | `/learn`, `/learn/[kuId]`, `/learn/session`; `lessons` endpoints | N | not yet |
| Library (lessons) | `/library`, `/library/[id]`, `/library/lesson/[id]` | N | not yet |
| Profile / stats dashboard | `/profile`; `GET /stats` | N | not yet |
| Content-quality flagging (admin) | `content-flags.controller` (`AdminGuard`); `/admin/content-quality` | N (flags only; validation is §4) | not yet |
| API-log viewer (admin) | `GET /apilogs*`; `/admin/logs` | N (viewer) | not yet |
| Prompt tester (admin UI) | `/admin/prompt-tester` → `POST /apilogs/prompt-test` | Y | not yet |
| Auth (passwordless email-link) | `/login`, `/auth/callback`; `FirebaseAuthGuard` | N | not yet |
| Content import / seed | `scripts/import-content-to-firestore.js`, `generate-grammar-kus.js` | N | not yet |

## Notes
- Every row's harness column is **"not yet"** by design — this is the pre-harness baseline.
- Nuance rows (`N(match)/Y(miss)`, `Y(gen)/N(grade)`) matter for the free-tier degradation question in `grading-inventory.md`: the deterministic halves are what a no-AI free tier could keep.
- Free-tier / allowlist enforcement is **not** yet a feature on any of these rows — see F-001.
