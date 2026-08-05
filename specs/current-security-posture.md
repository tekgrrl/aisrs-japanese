# Current Security Posture (#4)

**Scope:** Firestore/storage rules, auth flows, client-side-only enforcement, App Check — **as they exist today**. Describe-only; no fixes. Inferences labeled. Detailed remediation decisions live in `findings.md` (F-001–F-005); this doc adds the rules/auth/config layer and flags candidate new findings at the end.

## TL;DR
The app is currently in a **dev/emulator security posture**, not a production one. Auth itself is sound (Firebase passwordless email-link → verified ID token → server-side guard). But the data layer is wide open (`allow read, write: if true`), there is no App Check, admin/tier enforcement is thin (see F-001/F-004), and all deployment config points at local dev (`aisrs-japanese-dev`, `localhost:3500`). This aligns with the user's realization that a dedicated production DB and hardening pass are prerequisites to ship.

## 1. Authentication flow
- **Login:** passwordless email-link. `sendSignInLinkToEmail` (`frontend/src/app/login/page.tsx:27`) → callback `signInWithEmailLink` (`frontend/src/app/auth/callback/page.tsx:25`). No passwords. Firebase Auth is the IdP.
- **Token propagation:** `apiFetch` attaches the current user's Firebase ID token as `Authorization: Bearer <token>` (`frontend/src/lib/api-client.ts`). Frontend reaches the backend via a Next rewrite `/api/:path*` → `http://localhost:3500/:path*` (`frontend/next.config.*`, hardcoded).
- **Server verification:** `FirebaseAuthGuard` calls `admin.auth().verifyIdToken` (`backend/src/auth/firebase-auth.guard.ts:43`). `@UserId()` returns `request.user.uid` set from the *verified* token (`user-id.decorator.ts`) — for guarded endpoints, uid is token-derived, **not** client-supplied. (Exception: `/apilogs/prompt-test` reads `uid` from the body — see F-002.)
- **Dev bypasses (both tiers):** client `NEXT_PUBLIC_DEV_SKIP_AUTH` sends `X-Dev-User-Id` instead of a token (`api-client.ts`); server `FirebaseAuthGuard` injects `user_default` when `NODE_ENV !== 'production'`, even on *failed* verification (`firebase-auth.guard.ts:13,29`). Logged as **F-004**.

## 2. Firestore security rules — 🚩 wide open
`firestore.rules` (repo root) is:
```
match /{document=**} { allow read, write: if true; }
```
Self-labeled "TEMPORARY DIAGNOSTIC RULE … ONLY safe because we are on the local emulator."
- **What it means:** anyone with the project's (public) Firebase client config can read/write the **entire database directly**, bypassing every backend guard, tier check, and per-user scope.
- **Mitigating fact (not a fix):** the frontend does **not** use the Firestore client SDK for data — `firebase-client.ts` exports `db`, but grep shows only `auth` is ever imported; there are zero client `collection()/getDocs/onSnapshot/setDoc` calls. All data flows through the NestJS backend via the **Admin SDK**, which bypasses rules by design. So the app does not *depend* on open rules — but the rules still leave a real DB fully exposed if deployed to a non-emulator Firestore. *(Confirmed by import/usage grep.)*
- **Candidate finding F-006** (see below).

## 3. Storage rules
- **None.** No `storage.rules` file; `firebase.json` configures only emulators + firestore rules. Grep for `getStorage`/`firebase/storage`/`uploadBytes` across frontend and backend → **no hits**. Firebase Storage is not used, so absent rules are not currently a live exposure. *(Confirmed.)* Local images (`coffee_order.jpeg`, etc.) are repo files, not Storage objects.

## 4. App Check
- **Not implemented, anywhere.** Grep for `appcheck|initializeAppCheck|ReCaptcha` across frontend + backend → **no hits**. No client attestation; backend accepts any request bearing a valid Firebase ID token regardless of origin/app integrity. *(Confirmed.)*

## 5. Client-side-only enforcement
- **Route protection is client-side:** `AuthProvider` redirects unauthenticated users to `/login` (`frontend/src/providers/AuthProvider.tsx:73-81`). Standard SPA pattern; the real enforcement is the backend guards. Not a finding on its own.
- **Admin UI gating is client-side:** `AuthProvider` sets `isAdmin` from the user doc (`:59`) and forces it `true` under dev-skip (`:46`); `AvatarMenu` shows the admin link when `isAdmin` (`AvatarMenu.tsx:106`). Server-side, admin endpoints are enforced by `AdminGuard` — **but** the admin prompt-tester UI calls the **unguarded** `/apilogs/prompt-test` (F-002), so that surface has *only* client gating.
- **No tier/free-vs-paid gating exists on the client either** — grep for `tier|premium|free-tier|allowlist|entitlement` → only an unrelated "Tiered guidance" comment. Confirms the free-tier boundary is unimplemented on both ends (F-001).

## 6. Backend authorization model (summary)
- Two guards only: `FirebaseAuthGuard` (any authenticated user) and `AdminGuard` (authed + `users/{uid}.isAdmin`, or `ADMIN_ALL=true` bypass — F-004). No role/tier/allowlist layer.
- Per-user data isolation relies on uid-scoped subcollections (`users/{uid}/...`) with the token-derived uid — sound where guards run.
- **Unguarded controllers:** `ApilogController` (F-002, F-006-candidate), `AudioController` (F-003), `AppController` (`GET /`, F-003).

## 7. Deployment / config posture
- **Single Firebase project, dev:** `.firebaserc` → `aisrs-japanese-dev`. No prod project. `firebase-client.ts` hardcodes `projectId: "aisrs-japanese-dev"` with `dummy-key` fallbacks.
- **Hardcoded local backend:** Next rewrite target is `http://localhost:3500` — no prod backend URL/config.
- **`firebase.json` is emulator-only** (no hosting/deploy targets). Consistent with "never had a production deployment path" — ties directly to the prod-DB realization.
- **Frontend Admin SDK files appear unused:** `frontend/src/lib/firebase.ts` + `firebase-admin.ts` initialize the Admin SDK, but grep finds no importers and there are no `src/app/api` routes. *(Inference: dead/legacy; if ever wired up, shipping service-account credentials to a Next server surface would need review.)*

## Cross-reference to registry
| Posture item | Finding |
|---|---|
| No server-side tier/allowlist (§5, §6) | F-001 (blocker) |
| Unauthenticated arbitrary-prompt route (§6) | F-002 (blocker) |
| Unauthenticated paid TTS + `GET /` (§6) | F-003 (gate) |
| Env-gated auth/admin bypasses (§1, §6) | F-004 (gate) |
| Unauthenticated `/apilogs` log viewer (§6) | F-005 (gate) |

## Candidate new findings (for your decision — not yet logged)
- **F-006 (recommend: blocker) — Firestore rules `allow read, write: if true`.** Full DB read/write to anyone with the public config once on a non-emulator Firestore. App doesn't depend on client Firestore access, so tightening rules shouldn't break it — but that's a remediation note, your call. Ties to the prod-DB work.
- **F-007 (recommend: gate) — No App Check.** No app-integrity attestation on any backend or Firebase surface; abuse/automation vector, relevant to cost control (pairs with F-002/F-003).
- **(watch, optional) — Dev-only deployment config** (single dev project, hardcoded `localhost:3500`, dummy config, unused frontend Admin SDK). More a deployment-gating checklist item than a vuln; noting so it isn't lost.
