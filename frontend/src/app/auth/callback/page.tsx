"use client";

import { useEffect, useState } from "react";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase-client";
import { useRouter } from "next/navigation";
import { EMAIL_FOR_SIGN_IN_KEY } from "@/app/login/page";

type Status = "checking" | "needs-email" | "signing-in" | "error";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  // Cross-device: user opened the link on a different device and localStorage is empty
  const [confirmEmail, setConfirmEmail] = useState("");
  const router = useRouter();

  const completeSignIn = async (email: string) => {
    setStatus("signing-in");
    try {
      await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem(EMAIL_FOR_SIGN_IN_KEY);
      // onAuthStateChanged in AuthProvider fires → calls /api/users/me → redirects to /
    } catch (err) {
      setError(getErrorMessage((err as AuthError).code));
      setStatus("error");
    }
  };

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      // Not a valid sign-in link — send back to the login page
      router.replace("/login");
      return;
    }

    const stored = window.localStorage.getItem(EMAIL_FOR_SIGN_IN_KEY);
    if (stored) {
      completeSignIn(stored);
    } else {
      // Cross-device sign-in: ask the user to confirm their email
      setStatus("needs-email");
    }
    // completeSignIn only uses window.location.href which is stable on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    completeSignIn(confirmEmail);
  };

  /* ── Spinner while checking / signing in ───────────────────────────── */
  if (status === "checking" || status === "signing-in") {
    return (
      <div className="min-h-screen bg-shodo-paper flex items-center justify-center">
        <p className="animate-pulse text-shodo-ink/50 text-sm">
          Signing you in…
        </p>
      </div>
    );
  }

  /* ── Cross-device: confirm email ────────────────────────────────────── */
  if (status === "needs-email") {
    return (
      <div className="min-h-screen bg-shodo-paper flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-shodo-ink tracking-tight">
              AIGENKI
            </h1>
          </div>
          <p className="text-shodo-ink/70 text-sm mb-4">
            Confirm your email address to complete sign-in.
          </p>
          <form onSubmit={handleConfirm} className="space-y-4">
            <input
              type="email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-shodo-ink/20 rounded-md bg-shodo-paper text-shodo-ink placeholder-shodo-ink/30 focus:outline-none focus:ring-1 focus:ring-shodo-ink/40 text-sm"
            />
            <button
              type="submit"
              className="w-full py-2 px-4 bg-shodo-ink text-shodo-paper rounded-md font-medium text-sm hover:bg-shodo-ink/85 transition-colors duration-200"
            >
              Confirm
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-shodo-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-4">
        <h1 className="text-4xl font-bold text-shodo-ink tracking-tight">
          AIGENKI
        </h1>
        <p className="text-shodo-ink/70 text-sm">{error}</p>
        <a
          href="/login"
          className="inline-block text-sm text-shodo-ink/50 hover:text-shodo-ink transition-colors duration-200 underline underline-offset-2"
        >
          Back to sign-in
        </a>
      </div>
    </div>
  );
}

function getErrorMessage(code: string): string {
  switch (code) {
    case "auth/expired-action-code":
      return "This sign-in link has expired. Please request a new one.";
    case "auth/invalid-action-code":
      return "This sign-in link is invalid or has already been used.";
    case "auth/invalid-email":
      return "The email address doesn't match. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Sign-in failed. Please request a new link.";
  }
}
