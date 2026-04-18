# AISRS-Japanese Architecture

This document describes the high-level architecture of the AISRS-Japanese project.

## Overview
AISRS-Japanese is a bilingual Language Learning app utilizing AI (Google Gemini) to generate comprehensive lessons and reviews tailored to the user's progress. 

The application is built on a split architectural model:
- **Frontend** (`/frontend` folder): A Next.js 15 app router application providing the UI.
- **Backend** (`/backend` folder): A NestJS REST API server handling all business logic, DB interactions, and third-party API calls.
- **Database**: Firebase Firestore.
- **AI Brain**: Google Gemini via `@google/genai` (used extensively in the `/backend/src/gemini` and `/backend/src/lessons` modules).

**Note**: We've failed so far in attempts to convert the app into a monorepo. Eventually we will need to complete this task

## Design Principles
1. **Separation of Concerns**: The frontend is strictly a view layer containing UI components, React state, and data-fetching hooks. The backend is the definitive source of truth and the only service allowed to connect directly to the database.
2. **AI-First Generation**: Content is dynamically generated using the current model (Gemini 3.0 Flash Preview) instead of relying on pre-authored datasets. Knowledge Units (KUs), lessons, and review-facets are distinct entity types, each having its own document, and are assembled just-in-time.
3. **Database Workflow**: For local development, the backend handles all database interactions. You can optionally use the Firestore Emulator (`localhost:8080`) for testing.

## Data and Types

### Types
Backend and Frontend are effectively separate components that communicate via REST API.  Aim is to one day convert to a monorepo. Each component has it's own type definitions file located in `<component>/src/types/index.ts`, they should basically be the same but can get our of sync. The types have developed over time on the basis that there is a single user using the system. Plumbing for users has been added but is not actually used in anyway other than to provide a default auth token for use in authenticating calls to the backend. We tried to separate the "Global" data from user specific data but the AI made some poor choices.

### Data
Basic Vocab data was extracted from Wanikani and then boiled down to non-proprietary data including content/slug, reading, meaning and wanikani level. These data have been bulk added to the `knowledge-units` collection in Firestore.

## Component Responsibilities

### Frontend (`/frontend`)
- **Framework**: Next.js 15+, React 19, TypeScript, Tailwind CSS v4.
- **Core App**: Built around `/src/app/learn`, `/src/app/review`, `/src/app/manage`, and `/src/app/scenarios`.
- **API Interaction**: The frontend natively queries the backend endpoint (`http://localhost:3500`). It does **not** query Firestore directly. Next.js server-side features are minimized in favor of the specialized NestJS backend.
- **State Synchonization**: Uses lightweight approaches like dispatching custom client-side events (e.g., `refreshStats`) that components listen to and respond by re-fetching data via their hooks.

### Backend (`/backend`)
- **Framework**: NestJS 10+, TypeScript.
- **Module Structure (Core):**
  - **`knowledge-units`**: CRUD operations and schema logic for KUs.
  - **`review-facets`**: Logic handling the Spaced Repetition System (SRS). Converts learning queue items to review queues using `nextReviewAt` timestamp filtering.
  - **`lessons`**: Assembles Prompts, queries Gemini, and translates the structured JSON or text back to the client.
  - **`scenarios`**: Complex logic handling multi-turn roleplay conversations, evaluations, and state machines mapping encountering new phrases to learning loops.
  - **`stats`**: Central endpoint for aggregating dashboard/queue numbers.
- **Database Access**: Uses `firebase-admin` natively (not via Web SDK). Note: Next.js API Routes must not use `firebase-admin`; thus, all such operations are fully isolated in this NestJS layer.
- **Gemini**: Relies heavily on high-context, single prompt instructions using the current model (`gemini-3-flash-preview`) rather than generic `systemInstruction` prompts.

## Development Setup
- **Node/Package**: Uses `yarn` workspaces or separated `yarn` installs in each folder depending on CI config. DO NOT USE `npm`.
- **Running Locally**:
  - Frontend: Runs on `http://localhost:3000` (`yarn dev` inside `/frontend`)
  - Backend: Runs on `http://localhost:3500` (`yarn start:dev` inside `/backend`)
  - Firestore Emulator (Optional for testing): Runs on `http://localhost:8080` (usually launched via root `firebase emulators:start`)

## ToDo

### Manage page
- Add JLPT badges and Wanikani level badges to the listings for each Vocab
- Add a way to filter by JLPT level and Wanikani level
- **Meta requirement**: The manage page should eventually be just and admin function and not a list of the Vocab the User has in their learning or review queues or in their overall user context (if we go down that route). This requires a lot of other work to be done first.

### Users
- (Done) Global KU data is stored in the `knowledge-units` collection in Firestore, accessed via the `knowledge-units` service. The service is now user-agnostic — no `userId` filtering on reads, no `userId` written to new documents.
- (Done) User KU metadata is stored in `users/{uid}/user-kus` as `UserKnowledgeUnit` documents referencing global KUs via `kuId`. Managed by `UserKnowledgeUnitsService`.
- (Done) Users can sign up and log in via passwordless email-link auth.
- (Done) When a user interacts with a scenario and clicks "Start Drilling", `UserKnowledgeUnit` documents are created in their sub-collection — this populates their Learning Queue.
- (Done) Questions have been overhauled — see **Question Corpus** section below and Migration History.

## User Management, Authentication & Multi-Tenancy

This section documents the current implementation of auth and user scoping so that agents completing the Users ToDo items have a clear baseline to build from.

### Current State Summary

The system is now **multi-tenant**. Real users sign in via passwordless email-link auth and get fully isolated data in Firestore sub-collections. The admin user (`user_default`) retains access to top-level collections for corpus management. The backend guard falls back to `user_default` in dev mode when no token is present.

---

### Authentication Flow

**Frontend → Backend token handoff**

1. `frontend/src/providers/AuthProvider.tsx` — wraps the app. On mount, `onAuthStateChanged` fires; if no session exists it calls `signInAnonymously()`. The resulting Firebase `User` object is stored in React Context.
2. `frontend/src/lib/firebase-client.ts` — initialises the Firebase Web SDK (project `gen-lang-client-0878434798`, env vars `NEXT_PUBLIC_FIREBASE_API_KEY` / `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`). In development it connects to the Firestore Emulator at `localhost:8080`.
3. `frontend/src/lib/api-client.ts` — thin `fetch` wrapper. Before every request it calls `auth.authStateReady()` then `auth.currentUser.getIdToken()` and injects the result as `Authorization: Bearer <token>`. Failures are caught and logged but the request still proceeds (without a token).

**Backend token validation**

`backend/src/auth/firebase-auth.guard.ts` implements `FirebaseAuthGuard`:

- **Development (`NODE_ENV !== 'production'`):**
  - No `Authorization` header → sets `request.user = { uid: 'user_default' }`, returns `true`.
  - Token present but `admin.auth().verifyIdToken()` throws → sets `request.user = { uid: 'user_default' }`, returns `true`.
  - Token valid → sets `request.user = decodedToken` (real Firebase UID).
- **Production (`NODE_ENV === 'production'`):**
  - No header → throws `UnauthorizedException`.
  - Invalid token → throws `UnauthorizedException`.
  - Valid token → sets `request.user = decodedToken`.

`backend/src/auth/user-id.decorator.ts` — `@UserId()` param decorator that reads `request.user?.uid`. Used on every protected controller method.

**Admin/default user**

`backend/src/lib/constants.ts` exports `ADMIN_USER_ID = 'user_default'`. The string `'user_default'` is also hardcoded directly in `firebase-auth.guard.ts` (dev-mode fallback) — a TODO exists in `constants.ts` to consolidate this. The admin user manages the global KU corpus and writes to top-level Firestore collections; all other users write to per-user sub-collections.

---

### Guard Coverage

Every controller applies `@UseGuards(FirebaseAuthGuard)` at the class level:
- `auth.controller.ts`, `user.controller.ts`, `knowledge-units.controller.ts`, `reviews.controller.ts`, `lessons.controller.ts`, `questions.controller.ts`, `stats.controller.ts`, `scenarios.controller.ts`, `kanji.controller.ts`

All service methods accept `uid: string` as their first parameter and use it for Firestore scoping (see below).

---

### Firestore Multi-Tenancy Pattern

The database uses **flat top-level collections** (not Firestore sub-collections per user). Tenancy isolation is enforced by a `userId` field on every document, not by collection path.

**Query scoping** — every `findAll`-style query adds `.where('userId', '==', uid)`:
- `knowledge-units.service.ts` line 23
- `reviews.service.ts` line 64, 328, 378
- `lessons.service.ts` line 196, 231
- `stats.service.ts` line 21, 27, 33
- `scenarios.service.ts` line 42

**Ownership verification** — every `findOne`/`update`/`delete` method re-checks `doc.data().userId !== uid` and throws `NotFoundException` on mismatch:
- `knowledge-units.service.ts` line 353
- `knowledge-units.service.ts` line 187 (update)
- `scenarios.service.ts` line 64

**Write operations** always include `userId: uid` in the document payload.

**Exception — `api-logs` collection** is written without a `userId` field and is not scoped per user.

---

### Firestore Collection Map

| Collection | Scoped by userId? | Notes |
|---|---|---|
| `knowledge-units` | **No** | Global corpus — no `userId` on new docs; legacy docs may still have `userId: 'user_default'` |
| `users/{uid}/user-kus` | Yes — sub-collection path | Per-user KU metadata; `kuId` references global KU |
| `users/{uid}/review-facets` | Yes — sub-collection path | Per-user SRS facets (non-admin users) |
| `review-facets` | Yes (field) | Admin (`user_default`) SRS facets only; `userId` field still required |
| `lessons` | Yes (field) | AI-generated lesson documents |
| `questions` | **No** | Global question corpus — no `userId` on new docs. `rank` and `rejectionCount` fields drive selection. |
| `users/{uid}/question-states` | Yes — sub-collection path | Per-user `UserQuestionState`: `rejected`, `consecutiveFailures`, `kuId` |
| `scenarios` | Yes (field) | Roleplay scenario state |
| `user-stats` | Yes — doc ID is uid | Legacy stats; `USER_STATS_COLLECTION.doc(uid)` |
| `users` | Yes — doc path `users/{uid}` | `UserRoot` document (stats, tutorContext, preferences) |
| `api-logs` | **No** | Centralised logging; no user field |

---

### Key Types

- **`UserRoot`** (`backend/src/types/index.ts` ~line 34) — stored at `users/{uid}`. Contains `stats`, `tutorContext`, and `preferences` (e.g. `dailyMaxNew`).
- **`KnowledgeUnit`** (~line 205) — has `userId` field (marked `@deprecated` as part of future migration to a separate `user-kus` sub-collection). `data` bag holds `jlptLevel`, `wanikaniLevel`, `reading`, `meaning`.
- **`UserKnowledgeUnit`** (~line 235) — intended future shape: user metadata (`status`, `personalNotes`, `facet_count`) pointing at a global KU via `kuId`. **Not yet used in queries.**
- **`ReviewFacet`** (~line 261) — bridges to `KnowledgeUnit` via `kuId`; carries `srsStage` (0–8) and `nextReviewAt`.
- **`QuestionItem`** — global question document. `rank: number` (0–100, starts 50, suitable threshold 30); `rejectionCount: number` (observability only). Deprecated fields (`userId`, `status`, `lastUsed`, `previousAnswers`) may exist on legacy docs but are ignored.
- **`UserQuestionState`** — stored at `users/{uid}/question-states/{questionId}`. `rejected: boolean` (user never sees this question again); `consecutiveFailures: number` (persists across sessions, resets on correct answer, triggers rotation at 3); `kuId` (denormalised for querying).

---

### Environment Variables

**Backend (`backend/.env`)**
```
GOOGLE_CLOUD_PROJECT=gen-lang-client-0878434798   # Firebase project
FIRESTORE_DB=aisrs-japanese-dev                    # Named Firestore database
NODE_ENV                                           # 'production' enables strict auth
```

**Frontend (`frontend/.env.local`)**
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gen-lang-client-0878434798.firebaseapp.com
```

---

### What Needs to Be Done (Implementation Guide for Agents)

The following work is required to complete proper multi-user support. Each item builds on the previous.

**1. Replace anonymous auth with real sign-up / sign-in**
- Frontend: add email/password (or Google OAuth) sign-in UI. The `AuthProvider` already handles `onAuthStateChanged`; swap `signInAnonymously()` for the chosen provider.
- Backend: no changes needed — the guard already calls `admin.auth().verifyIdToken()` correctly for real users.

**2. User creation on first login**
- When a new UID is seen for the first time, create a `users/{uid}` document (default `UserRoot`) and seed any required initial state.
- This can live in the `UsersService` (`backend/src/users/user.service.ts`) called from an `onAuthStateChanged` or a dedicated `/users/init` endpoint.

**3. ~~Migrate KU user-data to `users/{uid}/user-kus`~~ — Done**
- `knowledge-units` is now a global corpus with no `userId` on new documents.
- `users/{uid}/user-kus` sub-collection holds per-user KU metadata via `UserKnowledgeUnitsService`.
- `users/{uid}/review-facets` sub-collection holds per-user SRS facets for non-admin users.
- The Learning Queue (`GET /api/knowledge-units/get-all?status=learning`) returns only the user's UKU-joined global KUs.
- `KnowledgeUnitsController.findOne` authorises access via direct ownership (admin) OR existence of a UKU for that `kuId`.

**4. Harden the dev guard bypass**
- The current fallback to `user_default` on any token failure in dev mode is useful but should log a warning so it is obvious when a real token is being silently dropped.
- Consider making the default UID configurable via env var (`DEFAULT_DEV_UID`) so individual developers can test with their own UID against a shared emulator.

**5. Scope `api-logs` by user (optional)**
- Add `userId` field to log documents so per-user activity can be audited.

## Question Corpus

`AI-Generated-Question` facets draw from a **global question corpus** shared across all users for the same KU.

### Selection logic (`QuestionsService.selectQuestion`)
1. If the facet has a `currentQuestionId`, try to reuse it — passes if `rank >= 30`, not rejected by this user, and `consecutiveFailures < 3`.
2. Otherwise query all questions for the KU, apply the same suitability filters, pick the first passing candidate.
3. If no suitable question exists, generate a new one via Gemini and save it to the global corpus.

### Ranking
| Event | `questions/{id}.rank` | `UserQuestionState` |
|---|---|---|
| Correct answer | +5 | `consecutiveFailures = 0` |
| Wrong answer | no change | `consecutiveFailures++` |
| Keep feedback | +5 | — |
| Request New | no change | `rejected = true`; global `rejectionCount++` |
| Report feedback | -25 | — |

Rank nominally 0–100 but is not hard-clamped; `>= 30` is the only gate used in queries.

### Key endpoints
- `GET /api/questions/generate?topic=&facetId=&kuId=` — returns `{ question, answer, context, accepted_alternatives, questionId, isNew }`. `isNew: true` means no `UserQuestionState` exists yet for this user; the frontend uses this to decide whether to show the feedback modal.
- `PATCH /api/questions/:id/feedback` — body `{ feedback: 'keep' | 'request-new' | 'report' }`.

### Migration note for existing question documents
Legacy docs lack `rank` and `rejectionCount`. They are served correctly on first use (`rank ?? 50` at read time) but fall below the suitability threshold after their first correct answer or feedback write (`FieldValue.increment` initialises missing fields from 0). Run a one-time backfill of `{ rank: 50, rejectionCount: 0 }` across the `questions` collection to restore them.

---

## Migration History

**Note**: This section is very much outdated but should be used to summarize the history of the project. 

Previously, the Next.js `frontend` app hosted Next API Routes (`/src/app/api/...`) that directly connected to a `db.json` and then migrated to Firestore. Those legacy Next.js API endpoints are now deprecated and moved into the `legacy-api/` directory (or removed). The backend is strictly the `/backend` folder.

**Multi-tenant auth implementation (2026-04)**

- Replaced anonymous Firebase sign-in with **passwordless email-link authentication** (`sendSignInLinkToEmail` / `signInWithEmailLink`).
- Added `frontend/src/app/login/page.tsx` — email-only "Send Sign-in Link" form. Shows a confirmation screen after the link is sent. No header rendered on this page.
- Added `frontend/src/app/auth/callback/page.tsx` — landing page for the Firebase email link. Calls `isSignInWithEmailLink` + `signInWithEmailLink` to complete auth. Handles cross-device sign-in (prompts for email if localStorage is empty on a different device).
- Rewrote `frontend/src/providers/AuthProvider.tsx`:
  - `onAuthStateChanged` drives routing. Public paths (`/login`, `/auth/callback`) are accessible without auth; all other routes redirect to `/login`.
  - On successful auth, calls `GET /api/users/me` (idempotent find-or-create) to initialise the `users/{uid}` document.
  - Exposes `signOut()` via `AuthContext`.
- Updated `frontend/src/components/Header.tsx`:
  - Returns `null` when `user` is not set, so no nav chrome appears on public pages.
  - Stats are only fetched after a user is confirmed.
  - Displays truncated user email and a "Sign out" button.
- The backend `FirebaseAuthGuard` dev-mode fallback is extended: when no Bearer token is present it now reads the `X-Dev-User-Id` request header (if set) before falling back to `user_default`. This lets the frontend dev bypass target a specific UID.
- **Dev workflow**: to run the frontend against existing Firestore data without signing in, pass both env vars at start time:
  ```
  NEXT_PUBLIC_DEV_SKIP_AUTH=true NEXT_PUBLIC_DEV_USER_ID=<uid> yarn dev
  ```
  Omit `NEXT_PUBLIC_DEV_USER_ID` to fall back to `user_default`.
**Multi-tenant data isolation (2026-04)**

- **`knowledge-units` made global**: Removed `userId` from all `KnowledgeUnitsService` method signatures and Firestore queries. New KU documents are written without a `userId` field. `KnowledgeUnitsService` is now user-agnostic; `findByContent` absorbs the former `findByContentGlobal`.
- **`UserKnowledgeUnitsService`** added (`backend/src/user-knowledge-units/`): manages `users/{uid}/user-kus` sub-collection. `create(uid, kuId)` is idempotent. `findLearningQueueAsKUs(uid)` batch-joins UKUs with their global KUs for the learning queue endpoint.
- **Scenario → UKU flow**: `ScenariosService.advanceState` (encounter→drill) now creates `UserKnowledgeUnit` records instead of `KnowledgeUnit` records. Vocab not found in the global corpus is skipped with a warning.
- **`review-facets` per-user sub-collection**: `ReviewsService` routes all facet reads/writes to `users/{uid}/review-facets` for non-admin users; `user_default` continues to use the top-level `review-facets` collection with `userId` field scoping. Same routing applied in `StatsService`.
- **`ADMIN_USER_ID` constant**: `CURRENT_USER_ID` renamed to `ADMIN_USER_ID` in `backend/src/lib/constants.ts`. The string `'user_default'` remains hardcoded in `firebase-auth.guard.ts` pending a follow-up cleanup.
- **Frontend**: `refreshStats` event dispatched after successful encounter→drill advance so the Learn tab badge updates immediately.

**Question corpus overhaul (2026-04)**

- Replaced the broken per-facet `questionAttempts` reuse logic with a global question corpus and per-user state model.
- `questions` collection is now user-agnostic (no `userId` on new docs). Added `rank: number` (starts 50) and `rejectionCount: number` fields.
- New `users/{uid}/question-states/{questionId}` sub-collection stores per-user `UserQuestionState` (`rejected`, `consecutiveFailures`, `kuId`).
- `QuestionsService` rewritten: `selectQuestion` (reuse → corpus → generate), `recordAnswer` (rank/failure tracking), `recordFeedback` (keep / request-new / report).
- `PATCH /api/questions/:id` replaced by `PATCH /api/questions/:id/feedback` with `{ feedback }` body.
- `GET /api/questions/generate` now returns `isNew: boolean` instead of `status`; frontend uses it to gate the feedback modal.
- `POST /api/reviews/evaluate` now accepts optional `kuId` and calls `recordAnswer` on every evaluation.
- `ReviewFacet.questionAttempts` deprecated; `updateFacetQuestion` no longer resets it.
- Frontend `review/page.tsx`: `dynamicQuestionStatus` state replaced by `dynamicQuestionIsNew`; `isNewAiQuestion` simplified; feedback handlers call `recordFeedback`.

---
**Manage page scoped to user KUs (2026-04)**

- **`UserKnowledgeUnitsService.findAllAsKUs(uid)`** added: returns all KUs for a user regardless of status (learning or reviewing), by fetching the full `users/{uid}/user-kus` sub-collection and batch-joining against global `knowledge-units`. The shared join logic was extracted into a private `_joinKUs` helper, which `findLearningQueueAsKUs` also now uses.
- **`KnowledgeUnitsController` (`GET /api/knowledge-units/get-all`)**: added `status=user` branch that routes to `findAllAsKUs(uid)`.
- **`frontend/src/app/manage/page.tsx`**: changed the KU fetch from `/api/knowledge-units/get-all` to `/api/knowledge-units/get-all?status=user` so the Manage tab displays only the authenticated user's KUs instead of the entire global corpus.

- **Firebase Console prerequisites** for project `gen-lang-client-0878434798`:
  1. Authentication → Sign-in method → **Email/Password** enabled.
  2. Authentication → Sign-in method → **Email link (passwordless sign-in)** enabled (sub-toggle under Email/Password).
  3. Authentication → Settings → Authorized domains — ensure `localhost` is listed (removed by default in projects created after 2025-04-28).
  4. **Public-facing name** (controls the app name shown in auth emails): this field only becomes accessible in the Firebase Console once a third-party auth provider (e.g. Google Sign-In) is enabled. Enable Google Sign-In, set the name to `AIGENKI`, then disable Google Sign-In again if passwordless-only is preferred.
