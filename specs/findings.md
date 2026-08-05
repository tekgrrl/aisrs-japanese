# Findings Registry

Central registry for findings surfaced during the production-readiness evidence pass.
Evidence is gathered by Claude; **Decision** and **Rationale** are Amanda's and are entered only after discussion.

**Severity (gating language):**
- `blocker` — must be resolved before production ship; hard gate.
- `gate` — must be resolved *or* explicitly accepted before ship; a gating harness should verify it.
- `watch` — track and monitor; not ship-blocking on its own.
- `info` — informational; no action implied.

**Status lifecycle:** `Open` → `Acknowledged` → `Decided` → (`Deferred` / `Won't-fix` / `Resolved`)

**Confidence:** `Confirmed` (read in code) · `Inferred`

## Index

| ID | Title | Severity | Category | Contradicts arch | Status |
|----|-------|----------|----------|------------------|--------|
| F-001 | Live AI paths have no server-side allowlist/tier enforcement | blocker | security, architecture-mismatch | Yes | Decided |
| F-002 | `POST /apilogs/prompt-test` is unauthenticated + runs arbitrary prompts | blocker | security, cost | Yes | Decided |
| F-003 | `POST /audio/speak` and `GET /` are unguarded (paid TTS, no auth/rate limit) | gate | security, cost | No | Decided |
| F-004 | Auth guards have env-gated bypasses (dev fallthrough; `ADMIN_ALL`) | gate | security | No | Decided |
| F-005 | `GET /apilogs` and sub-routes unauthenticated (log/prompt data exposure) | gate | security | No | Decided |
| F-006 | Firestore rules wide open (`allow read, write: if true`) | blocker | security | No | Open |
| F-007 | No App Check on any client or server surface | gate | security, cost | No | Open |

---

### F-001 · Live AI paths have no server-side allowlist/tier enforcement
- **Category:** security, architecture-mismatch
- **Severity:** blocker · **Confidence:** Confirmed · **Contradicts stated architecture:** Yes
- **Description:** Every live AI endpoint (answer evaluation, question generation, lesson generation, scenario generation/chat/evaluate, concepts, tutor, kanji) is gated only by `FirebaseAuthGuard` — i.e. any authenticated user. There is no free/paid tier check and no allowlist anywhere in the request path.
- **Evidence:** `reviews.controller.ts:8`, `questions.controller.ts:7`, `lessons.controller.ts:11`, `scenarios.controller.ts:21`, `concepts.controller.ts:7`, `tutor.controller.ts:7`, `kanji.controller.ts:7` (all `FirebaseAuthGuard` only); `firebase-auth.guard.ts`, `admin.guard.ts` (no allowlist logic); grep `tier|allowlist|isAllowed` across controllers → no hits.
- **Impact:** The stated flow boundary — "free tier never touches AI; live AI paths allowlist-only, enforced server-side" — is not implemented. Any signed-in user reaches every paid AI path. This is the load-bearing gap for the flow-boundary spec.
- **Harness coverage:** not yet (security red-team)
- **Status:** Decided — build task
- **Decision:** Build robust server-side enforcement using a **two-gate model (a)**: (1) free tier → static / pre-generated content only, never any live AI path; (2) among non-free users, live AI is further restricted to an allowlist (owner + test users). Refactoring is in scope, not a bolt-on guard layer — the app was not designed with this boundary, so implement it properly.
- **Rationale:** The boundary is load-bearing (free tier must never reach live AI; live AI is allowlist-only). Because it was never designed in, a superficial layer would be fragile; a proper refactor is warranted. Two independent gates were chosen deliberately to stay fine-tunable — "nothing is ever that black and white."
- **Decided:** 2026-07-04
- **Related:** `ai-endpoints.md` §Surprises #1; F-002

---

### F-002 · `POST /apilogs/prompt-test` is unauthenticated and runs arbitrary prompts
- **Category:** security, cost
- **Severity:** blocker · **Confidence:** Confirmed · **Contradicts stated architecture:** Yes
- **Description:** `ApilogController` has no `@UseGuards`. Its `prompt-test` route forwards caller-supplied `systemPrompt`, `userMessage`, and even `model` straight into a Gemini call on the app's API key. It also writes no ApiLog, so usage is invisible to telemetry.
- **Evidence:** `apilog.controller.ts:40` (no guard), `:67` (`runPromptTest` handler passing through body), `apilog.module.ts` (`@Global()`, controller registered); `gemini.service.ts:1149` (`runPromptTest`, no logging wrapper).
- **Impact:** Anyone who can reach the backend can run arbitrary model calls billed to the project, with no auth, no rate limit, and no trace. Highest-severity single item for both security and cost.
- **Harness coverage:** not yet (security red-team, cost control)
- **Status:** Decided — build task
- **Decision:** `/apilogs/prompt-test` must not exist in production — restrict to local dev only (exclude from the prod build / route registration) rather than guarding it.
- **Rationale:** The endpoint has no production purpose; removing it entirely is safer than any runtime guard. Fail-closed would only be the fallback if it had to ship, which it doesn't.
- **Decided:** 2026-07-04
- **Related:** `ai-endpoints.md` §Surprises #2; F-001; F-005 (proposed)

---

### F-003 · `POST /audio/speak` and `GET /` are unguarded
- **Category:** security, cost
- **Severity:** gate · **Confidence:** Confirmed · **Contradicts stated architecture:** No
- **Description:** `AudioController` and `AppController` have no guard. `/audio/speak` invokes Google Cloud TTS (`ja-JP-Neural2-B`) with no auth and no rate limit. Not an LLM path, but a paid external API reachable by anyone.
- **Evidence:** `audio.controller.ts` (no `@UseGuards`), `google-tts.service.ts:21,27` (Neural2 synthesize), `app.controller.ts` (no guard).
- **Impact:** Unauthenticated, unmetered paid TTS is an abuse/cost vector; relevant to the cost-control harness. Not a contradiction of the stated *AI-model* boundary, but an unstated gap adjacent to it.
- **Harness coverage:** not yet (cost control, security red-team)
- **Status:** Decided — build task
- **Decision:** Serve cached / pre-rendered audio wherever possible, and add controls that head off any usage pattern that could drive runaway Cloud TTS spend (auth + rate/quota limits, abuse-pattern detection).
- **Rationale:** Cloud TTS is a metered paid service; uncached, unauthenticated, unmetered access is a cost and abuse risk. Pre-rendering removes most live calls; guardrails cap whatever remains.
- **Decided:** 2026-07-04
- **Related:** `ai-endpoints.md` §Surprises #3

---

### F-004 · Auth guards have env-gated bypasses
- **Category:** security
- **Severity:** gate · **Confidence:** Confirmed · **Contradicts stated architecture:** No
- **Description:** When `NODE_ENV !== 'production'`, `FirebaseAuthGuard` injects `user_default` on a missing token **and** falls through to `user_default` even when token verification *fails*. `AdminGuard` grants admin to every request when `ADMIN_ALL === 'true'`. Both protections rest entirely on production env values being set correctly.
- **Evidence:** `firebase-auth.guard.ts:13` (dev bypass), `:29` (fallthrough on verify failure); `admin.guard.ts:19` (`ADMIN_ALL` bypass).
- **Impact:** A misconfigured deploy (wrong `NODE_ENV`, or `ADMIN_ALL=true` in prod) silently disables auth / grants universal admin. A deployment-gating harness should assert these env values. Describe-only; no contradiction of a stated claim.
- **Harness coverage:** not yet (deployment gating, security red-team)
- **Status:** Decided — build task
- **Decision:** Convert auth/admin guards to a fail-closed pattern. Retain production admin access for now, but it must be explicitly opened (break-glass, not always-on) and fully auditable.
- **Rationale:** Current protections fail *open* on misconfiguration. Admin is still needed operationally, but standing universal admin is unacceptable; access must be deliberately activated and leave a durable audit trail.
- **Decided:** 2026-07-04
- **Related:** `ai-endpoints.md` §Surprises #4; F-005

---

### F-005 · `GET /apilogs` and sub-routes are unauthenticated
- **Category:** security
- **Severity:** gate · **Confidence:** Confirmed · **Contradicts stated architecture:** No
- **Description:** `ApilogController` has no `@UseGuards`. `GET /apilogs` returns raw API-log records whose `requestData`/`responseData` include system prompts and user answers; `GET /apilogs/latency` and `GET /apilogs/prompt-presets` expose latency stats and internal prompt templates. Distinct from F-002 (the arbitrary-prompt cost/abuse route on the same controller).
- **Evidence:** `apilog.controller.ts:40` (no guard), `:48` (`GET /apilogs` → `findAll`), `:61` (`/latency`), `:100` (`/prompt-presets`); log shape populated throughout `gemini.service.ts`.
- **Impact:** Unauthenticated exposure of prompt content, user answers, and internal prompt templates.
- **Harness coverage:** not yet (security red-team)
- **Status:** Decided — build task
- **Decision:** Unlike F-002's `prompt-test` (removed entirely), these routes **must exist in production** — they are the log viewer needed once a dedicated production DB exists — but must be **locked down fail-closed** (admin-only).
- **Rationale:** The move to a dedicated production DB makes an in-prod, access-controlled log/telemetry surface necessary; leaving it open leaks prompts and user answers.
- **Decided:** 2026-07-04
- **Related:** F-002, F-004

---

### F-006 · Firestore security rules are wide open
- **Category:** security
- **Severity:** blocker · **Confidence:** Confirmed · **Contradicts stated architecture:** No
- **Description:** `firestore.rules` is `match /{document=**} { allow read, write: if true; }`, self-labeled a "TEMPORARY DIAGNOSTIC RULE … ONLY safe … on the local emulator." Anyone with the project's public Firebase config can read/write the entire database directly, bypassing every backend guard, tier check, and per-user scope.
- **Evidence:** `firestore.rules` (repo root); `.firebaserc` → `aisrs-japanese-dev` (no prod project); `firebase.json` (emulator-only).
- **Mitigating fact (not a fix):** the frontend never uses the Firestore client SDK for data — only `auth` is imported from `firebase-client.ts`; all data flows through the backend Admin SDK (which bypasses rules by design). So the app does not depend on open rules — but a real (non-emulator) Firestore would be fully exposed.
- **Impact:** Full DB read/write to any client once deployed to a non-emulator Firestore. Directly relevant to the production-DB migration.
- **Harness coverage:** not yet (security red-team, deployment gating)
- **Status:** Open
- **Decision:** _(pending)_
- **Rationale:** _(pending)_
- **Decided:** _(pending)_
- **Related:** F-001 (backend is the only real enforcement today); production-DB migration

---

### F-007 · No App Check on any client or server surface
- **Category:** security, cost
- **Severity:** gate · **Confidence:** Confirmed · **Contradicts stated architecture:** No
- **Description:** No Firebase App Check / app-integrity attestation is implemented anywhere. The backend accepts any request bearing a valid Firebase ID token regardless of origin or app integrity; there is no protection against scripted/automated abuse of the API surface.
- **Evidence:** grep `appcheck|initializeAppCheck|ReCaptcha` across `frontend/src` + `backend/src` → no hits.
- **Impact:** Automation/abuse vector against all endpoints; amplifies the cost exposure in F-002/F-003 (paid AI + TTS callable at scale with only a valid token).
- **Harness coverage:** not yet (security red-team, cost control)
- **Status:** Open
- **Decision:** _(pending)_
- **Rationale:** _(pending)_
- **Decided:** _(pending)_
- **Related:** F-002, F-003
