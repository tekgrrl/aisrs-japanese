// The admin/default user who manages the global KU corpus and uses top-level Firestore collections.
// TODO: This value ('user_default') is also hardcoded directly in:
//   - backend/src/auth/firebase-auth.guard.ts (dev-mode fallback)
// Those references should eventually be replaced with this constant.
export const ADMIN_USER_ID = 'user_default';
