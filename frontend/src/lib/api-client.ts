import { auth } from "./firebase-client";

/**
 * A wrapper around the native browser `fetch` API.
 * It automatically looks up the current Firebase Auth user's token and
 * injects it into the Authorization header of the request.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  // Ensure Firebase has checked IndexedDB/LocalStorage for a session
  await auth.authStateReady();

  // If we have a user, attempt to get their active token
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
      console.log(`[apiFetch] Injected token for ${input}`);
    } catch (error) {
      console.error(`[apiFetch] Failed to get Firebase token for ${input}:`, error);
    }
  } else {
    console.warn(`[apiFetch] No currentUser available for ${input}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
