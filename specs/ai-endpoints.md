# AI Endpoints Inventory (#2)

**Scope:** every request path that results in a model call. Evidence-gathering only — no fixes.
**Method:** static read of `backend/src`. Frontend never calls a model directly; all model calls originate in the NestJS backend. Inferences are labeled.

## How model calls are wired

- One SDK: `@google/genai` (`GoogleGenAI`). Three independent clients instantiate it:
  - `GeminiService` — `backend/src/gemini/gemini.service.ts:41` (the bulk of calls)
  - `ValidationService` — `backend/src/validation/validation.service.ts:26`
  - `GeminiProvider` (tutor) — `backend/src/tutor/providers/gemini.provider.ts:27`
- **Model is env-driven**, not hard-coded per call:
  - `MODEL_GEMINI_FLASH` — used by all three clients. Defaults **disagree**: `gemini-3-flash-preview` (`gemini.service.ts:32`) vs `gemini-2.0-flash` (`validation.service.ts:25`, `gemini.provider.ts:26`). ⚠️ inconsistent fallback — real model depends on env.
  - `GEMINI_MODEL` — concept model override (`gemini.service.ts:33`), used only by `generateConcept`.
  - `AI_PROVIDER` — tutor picks provider: `claude` → `ClaudeProvider`, else `GeminiProvider` (`tutor.module.ts` useFactory).
- **Claude path is a stub.** `ClaudeProvider.chat()` throws "not yet implemented" (`claude.provider.ts:12`). So every live model call today goes to Gemini regardless of `AI_PROVIDER`.
- No global route prefix and no CORS config in `main.ts` (`backend/src/main.ts` — only a global `ValidationPipe`, `listen(PORT ?? 3500)`). Routes live at root (`/reviews/...`, `/apilogs/...`). *(Inference: frontend reaches these via a same-origin proxy/rewrite; not confirmed in this pass.)*

## Endpoint → model map

All guards below are **`FirebaseAuthGuard` = any authenticated user** unless noted. `AdminGuard` = authed + `users/{uid}.isAdmin === true` (or `ADMIN_ALL=true` env bypass, `admin.guard.ts:19`). **No endpoint performs a free-vs-paid tier check or an allowlist check** (see Surprises).

| # | Client trigger | HTTP endpoint | Service path | Gemini method | Guard | Tier/allowlist |
|---|---|---|---|---|---|---|
| 1 | Submit a review answer | `POST /reviews/evaluate` | `ReviewsService.evaluateAnswer` (`reviews.service.ts:273`) → **local exact-match first**, AI only on miss (`:302`) | `evaluateAnswer` (`gemini.service.ts:44`) | FirebaseAuthGuard | none |
| 2 | Request a quiz question | `GET /questions/generate` | `QuestionsService.selectQuestion` (`questions.service.ts:79`) → **reuses pooled question first**, AI only if none suitable (`:104`) | `generateWithTools` (tool loop, `gemini.service.ts:787`) | FirebaseAuthGuard | none |
| 3 | Open/generate a lesson | `POST /lessons/generate` | `LessonsService.generateLesson` (`lessons.service.ts:101`) | `generateLesson` (`gemini.service.ts:204`) | FirebaseAuthGuard | none |
| 4 | Bulk lesson import | `POST /lessons/batch` (fire-and-forget) | `lessonsService.processBatch` → `generateLesson` + `createContextCache` (`lessons.service.ts:74,348`) | `generateLesson`, `createContextCache` | FirebaseAuthGuard | none |
| 5 | Admin re-generate lesson | `POST /lessons/regenerate/:kuId` | `LessonsService.regenerateLesson` | `generateLesson` | **AdminGuard** | admin-only |
| 6 | View kanji details | `GET /kanji/details` | `KanjiService.getKanjiDetails` → **AI fallback only** when not stored (`kanji.service.ts:28`) | `generateKanjiDetails` (`gemini.service.ts:574`) | FirebaseAuthGuard | none |
| 7 | Create a scenario | `POST /scenarios/generate` | `ScenariosService.generateScenario` (`scenarios.service.ts:133,146`) | `generateScenario` (`gemini.service.ts:343`) | FirebaseAuthGuard | none |
| 8 | Import a scenario | `POST /scenarios/import` | `ScenariosService.importScenario` (`scenarios.service.ts:257,270`) | `generateScenario` | FirebaseAuthGuard | none |
| 9 | Send a chat turn | `POST /scenarios/:id/chat` | `ScenariosService.handleChat` (`scenarios.service.ts:532`) | `generateChatResponse` (`gemini.service.ts:904`) | FirebaseAuthGuard | none |
| 10 | Finish/score a scenario | reached via chat/advance → `generateEvaluation` (`scenarios.service.ts:615,644`) | `evaluateScenario` (`gemini.service.ts:998`) | FirebaseAuthGuard (via #9) | none |
| 11 | Generate a concept | `POST /concepts/generate` (async, 202) | `ConceptsService.generate` (`concepts.service.ts:149`) | `generateConcept` (`gemini.service.ts:1081`, uses `GEMINI_MODEL`) | FirebaseAuthGuard | none |
| 12 | Tutor scenario builder | `POST /tutor/generate-scenario` | `TutorService.generateScenario` → `AiProvider.chat` tool loop (`tutor.service.ts:121`) | `GeminiProvider.chat` (`gemini.provider.ts:49`) | FirebaseAuthGuard | none |
| 13 | Audio-facet creation (SRS) | internal — during `reviews/generate` & review-progress sequencing (`reviews.service.ts:401`, `review-progress.service.ts:206`) | `generateClozeSentence` (`gemini.service.ts:698`) | FirebaseAuthGuard (via caller) | none |
| 14 | Content-QA validation | internal — after lesson/scenario generation (`lessons.service.ts:458`, `scenarios.service.ts:782`) | `ValidationService.validateContent` (`validation.service.ts:29`) | inherited from caller | none |
| 15 | **Prompt tester** | **`POST /apilogs/prompt-test`** | passes arbitrary `systemPrompt`/`userMessage`/`model` straight through (`apilog.controller.ts:67`) | `runPromptTest` (`gemini.service.ts:1149`) | **NONE** ⚠️ | none |

## 🚩 Surprises — code contradicts the stated architecture

1. **No allowlist / tier enforcement exists anywhere.** The brief states live AI paths are "allowlist-only (me + test users), enforced server-side," and that free users never touch AI endpoints. In code, every live AI endpoint (#1–#13) is gated only by `FirebaseAuthGuard` — i.e. **any authenticated user**. There is no free/paid distinction, no allowlist, no `tier` field check. Grep for `tier|allowlist|isAllowed` across controllers returns nothing. **The described flow boundary is not implemented server-side.** *(Confirmed: read of every AI controller + both guards.)*

2. **`POST /apilogs/prompt-test` is completely unauthenticated and runs arbitrary prompts.** `ApilogController` (`apilog.controller.ts:40`) has **no `@UseGuards`**, is registered via a `@Global()` module (`apilog.module.ts`), and forwards caller-supplied `systemPrompt`, `userMessage`, and even `model` to `runPromptTest` on the app's Gemini API key. Anyone who can reach the backend can run arbitrary model calls billed to the project. This is the single most severe finding for both security and cost. *(Confirmed.)*

3. **`GET /` and `POST /audio/speak` are also unguarded.** `AppController` (`app.controller.ts`) and `AudioController` (`audio.controller.ts`) have no guard. `/audio/speak` → Google Cloud TTS (`ja-JP-Neural2-B`, `google-tts.service.ts:21`) — **not an LLM**, but a paid external API reachable with no auth and no rate limit; relevant to the cost-control harness. *(Confirmed.)*

4. **Auth guard has broad non-production bypasses.** `FirebaseAuthGuard` (`firebase-auth.guard.ts:13`): when `NODE_ENV !== 'production'`, a missing token injects `user_default`, and even a *failed* token verification falls through to `user_default` (`:29`). `AdminGuard` grants admin to everyone when `ADMIN_ALL === 'true'` (`admin.guard.ts:19`). Both are gated on env only — correctness depends entirely on production env being set correctly. *(Confirmed; describe-only.)*

## Notes for downstream specs
- Deterministic pre-checks that *avoid* the model exist for #1 (exact-match) and #2/#6 (pool/stored reuse) — carried into `grading-inventory.md`.
- Every model call is wrapped in `ApilogService` logging (route + model + duration + status) → an existing telemetry surface for the cost-control harness. Exception: `runPromptTest` logs nothing.
