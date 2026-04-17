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
- (Given) Global KU data is stored in the `knowledge-units` collection in Firestore and accessed via the `knowledge-units` service.
- (ToDo)User KU data **should be** metadata that references global KU data (not replicates). It should be stored in users/{uid}/user-kus
- (ToDo) We need to fully implement users and provide a way for users to sign up and log in.
  - When a new user logs in for the first time they'll start with a clean slate. Once we have this condition in place we can start to implement a way to add KUs to a user's learning queue using Scenarios and other tools.

## User Management, Authentication & Multi-Tenancy

This section documents the current implementation of auth and user scoping so that agents completing the Users ToDo items have a clear baseline to build from.

### Current State Summary

Authentication plumbing exists end-to-end but the system effectively operates as **single-tenant** today because the only real user in development is the hardcoded `user_default`. Firebase anonymous auth is wired up on the frontend and real Firebase ID tokens are passed to the backend, but the backend guard silently falls back to `user_default` on any failure or missing token in dev mode.

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

**Hardcoded default user**

`backend/src/lib/constants.ts` exports `CURRENT_USER_ID = 'user_default'`. The string `'user_default'` is also used directly in the guard. All Firestore documents written during local development will have `userId: 'user_default'`.

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
| `knowledge-units` | Yes (field) | All vocab KUs live here; `userId` field set on every doc |
| `review-facets` | Yes (field) | SRS state per KU facet |
| `lessons` | Yes (field) | AI-generated lesson documents |
| `questions` | Yes (field) | Question documents |
| `scenarios` | Yes (field) | Roleplay scenario state |
| `user-stats` | Yes — doc ID is uid | Legacy stats; `USER_STATS_COLLECTION).doc(uid)` |
| `users` | Yes — doc path `users/{uid}` | `UserRoot` document (stats, tutorContext, preferences) |
| `api-logs` | **No** | Centralised logging; no user field |

---

### Key Types

- **`UserRoot`** (`backend/src/types/index.ts` ~line 34) — stored at `users/{uid}`. Contains `stats`, `tutorContext`, and `preferences` (e.g. `dailyMaxNew`).
- **`KnowledgeUnit`** (~line 205) — has `userId` field (marked `@deprecated` as part of future migration to a separate `user-kus` sub-collection). `data` bag holds `jlptLevel`, `wanikaniLevel`, `reading`, `meaning`.
- **`UserKnowledgeUnit`** (~line 235) — intended future shape: user metadata (`status`, `personalNotes`, `facet_count`) pointing at a global KU via `kuId`. **Not yet used in queries.**
- **`ReviewFacet`** (~line 261) — bridges to `KnowledgeUnit` via `kuId`; carries `srsStage` (0–8) and `nextReviewAt`.
- **`UserQuestionState`** (~line 290) — bridges to a global `Question` via `questionId`; tracks answer history per user.

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

**3. Migrate KU user-data to `users/{uid}/user-kus`**
- Currently all KU data (including user-specific fields like `status`, `personalNotes`, `facet_count`) is stored in the flat `knowledge-units` collection with a `userId` field.
- Target: split into a **global** `knowledge-units` collection (content, reading, meaning, jlptLevel, wanikaniLevel — no `userId`) and a **per-user** sub-collection `users/{uid}/user-kus` (status, personalNotes, facet_count, kuId pointer).
- The `UserKnowledgeUnit` type already captures this intended shape.
- Update `KnowledgeUnitsService` to join the two on reads and write to the correct collection on creates/updates.

**4. Harden the dev guard bypass**
- The current fallback to `user_default` on any token failure in dev mode is useful but should log a warning so it is obvious when a real token is being silently dropped.
- Consider making the default UID configurable via env var (`DEFAULT_DEV_UID`) so individual developers can test with their own UID against a shared emulator.

**5. Scope `api-logs` by user (optional)**
- Add `userId` field to log documents so per-user activity can be audited.

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
- **Firebase Console prerequisites** for project `gen-lang-client-0878434798`:
  1. Authentication → Sign-in method → **Email/Password** enabled.
  2. Authentication → Sign-in method → **Email link (passwordless sign-in)** enabled (sub-toggle under Email/Password).
  3. Authentication → Settings → Authorized domains — ensure `localhost` is listed (removed by default in projects created after 2025-04-28).
  4. **Public-facing name** (controls the app name shown in auth emails): this field only becomes accessible in the Firebase Console once a third-party auth provider (e.g. Google Sign-In) is enabled. Enable Google Sign-In, set the name to `AIGENKI`, then disable Google Sign-In again if passwordless-only is preferred.
