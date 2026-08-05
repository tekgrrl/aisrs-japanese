# Data Inventory (#5)

**Scope:** the stock / reference data collections — schemas, counts, where consumed — to feed the data-quality audit harness. Describe-only. Inferences labeled.

**Counts caveat (important):** Firestore collection constants and schemas are read statically from source. **Live row counts are not captured in this pass** — the dev DB has months of accumulated (largely AI-generated) content and would need emulator/DB access to count. Where a number appears below it is the **seed-source count** (files in the `content/` sub-repo + `scripts/`), which is the curated baseline, not the current live total. Measuring the live delta is exactly the audit harness's job.

## Collection map (`backend/src/firebase/firebase.module.ts:7-20`)

| Collection | Kind | Stock? | Notes |
|---|---|---|---|
| `knowledge-units` | global | **Stock (core)** | The KU corpus — Vocab/Kanji/Grammar/Concept. Curated seed + some generated. |
| `lessons` | global, keyed by `kuId` | Stock + generated | Seeded from `content/lessons`, augmented by AI generation. |
| `questions` | global pool | Mixed | 72 seeded; rest AI-generated and pooled/reused across users. |
| `concepts` | global | Generated | AI-generated concept KUs. |
| `scenarios` | global | User-generated | Practice scenarios. |
| `content-flags` | global | QA output | Written by the validation/flagging path. |
| `api-logs` | global | Telemetry | Model-call logs. |
| `review-facets` | per-user | Not stock | SRS state. |
| `user-stats` | per-user | Not stock | Progress/stats. |
| `users/{uid}/…` subcollections | per-user | Not stock | `user-kus`, `user-concepts`, `question-states`, `user-grammar-lessons`, `user-lessons`. |

The **stock/reference data** the audit cares about is primarily `knowledge-units` (and its embedded `GrammarClassification`), plus the curated seed layer and the semi-curated `lessons`/`questions`.

## 1. `knowledge-units` — the core stock corpus
Discriminated union on `type` (`types/index.ts:255`): `Vocab | Kanji | Grammar | Concept | ExampleSentence`. Shared base (`KnowledgeUnitBase`, `:265`): `id`, `content`, `relatedUnits[]`, `createdAt`, `data`.

- **Vocab** (`:273`): `data.{ reading, definition, conjugationType (godan|ichidan|irregular), jlptLevel, wanikaniLevel, corpusNotes }`.
- **Kanji** (`:286`): `data.{ meaning, jlptLevel, wanikaniLevel, corpusNotes }`.
- **Grammar** (`:297`): `data.{ title, jlptLevel, classification (GrammarClassification), exampleInContext{ japanese, english, fragments[], accepted_alternatives[] } }`.
- **Concept** (`:313`): `data.{ title, reading?, overview, mechanics[]{ goalTitle, englishIntent, rule, simpleExample, … } }`.

**Consumed by** (near-universal — grep of KU service callers): `lessons`, `questions`, `reviews`, `review-progress`, `daily-plan`, `learning-progress`, `scenarios`, `tutor` services + `knowledge-units.controller`. This is the spine of the app; a data-quality defect here propagates to lessons, questions, SRS scheduling, and tutor context.

## 2. `GrammarClassification` — three-axis reference metadata
Embedded on Grammar KUs at `data.classification` (`types/index.ts:660`). Canonical hand-authored spec: `grammar-classification.md` (per project memory, never generated). Three axes:
- **`productionType`** (`:555`) — 2 values: `compositional`, `constructional`.
- **`structuralCategory`** (`:564`) — 12 values: `inflectional, particle, syntactic, derivational, numerical, modal, aspectual, discourse, comparative, speech-act, honorific, pragmatic`.
- **`expressiveFunctions[]`** (`:592`) — 25 values across 5 groups (describing / expressing-mind / acting / connecting / managing-conversation). First entry = primary function for lesson grouping.
- Plus `confusableWith?: string[]` (kuIds) — drives discrimination questions + contrasting SRS.

This classification is a prime audit target: enum-constrained, hand-authored, and load-bearing for question generation and SRS contrast scheduling.

## 3. `content/` — backup snapshot of stock data (not the canonical source)
**Origin (per owner):** `content/` began as a **backup of the app's stock data**, created to survive catastrophic data loss on the Firestore emulator. It is *not* the authoritative source — the **live Dev DB in Firestore is now the source of truth** (switching to it was partly motivated by this fragility). So the counts below are a **backup baseline** that may be **stale relative to the live DB**; treat them as a floor/reference for the audit, not the live inventory. *(A future decision — owner's — is whether to build `content/` out and keep it as a user-accessible feature.)*

The backup can be (re)imported via `scripts/import-content-to-firestore.js` (targets `knowledge-units` and `lessons`) and `scripts/generate-grammar-kus.js`.

| Source | Count (files/entries) | Feeds |
|---|---|---|
| `content/topics/vocab/*.md` | **112** | Vocab KUs (`import-content-to-firestore.js:130`, `knowledge-units` collection) |
| `content/lessons/vocab/*.md` | **113** | `lessons` collection |
| `content/contextExamples/*.md` | **648** | Embedded example sentences on lessons/KUs |
| `content/questions/*.md` | **72** | `questions` seed |
| `content/topics/*` (all) | **122** | topic/vocab source |
| `scripts/grammar-n5.json` → `patterns[]` | **96** N5 patterns | Grammar KUs (via `generate-grammar-kus.js`) |
| `scripts/jlptn4-5-kanji` | **278** kanji (one/line) | Kanji KUs |

*(Note: `content/` is a nested git repo — `content/.git` present — i.e. a submodule/vendored content set with its own history.)*

## 🚩 Notes for the data-quality audit harness
1. **`TutorVocabEntry` is not a stock collection.** The brief lists it as stock data, but in code it is an embedded shape `{ content, facetTypes }` (`types/index.ts:44`) held inside `users/{uid}.tutorContext` (`frontierVocab`, `leechVocab`, `weakGrammarPoints`, `:93-105`) — i.e. **per-user derived state**, not a curated corpus. Worth correcting before the audit scopes it.
2. **Curated vs generated split is the key audit axis.** The trustworthy baseline is the seed layer (topics 112, kanji 278, grammar patterns 96) + hand-authored `GrammarClassification`. The layers that accumulated via AI over months — `questions` (beyond the 72 seed), `concepts`, and generated `lessons` — are the ones the content-QA judge must gate **before** any deep-copy into the production DB.
3. **Live counts pending.** Getting real per-collection counts (and generated-vs-seed ratios) requires DB/emulator access — that measurement is itself an early harness task, not a static-read output. Flagging so the gap is explicit rather than silently assumed covered.
4. **`jlptLevel` is nullable everywhere** (`?: string | null` on Vocab/Kanji/Grammar). Given the level-constraint design (per project memory), null/inconsistent `jlptLevel` on stock KUs is a plausible data-quality defect class worth an explicit audit check.
