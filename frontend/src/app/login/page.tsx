"use client";

import { useState } from "react";
import { sendSignInLinkToEmail, AuthError } from "firebase/auth";
import { auth } from "@/lib/firebase-client";

export const EMAIL_FOR_SIGN_IN_KEY = "emailForSignIn";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const actionCodeSettings = {
      // Firebase redirects back to this URL after the user clicks the link.
      url: `${window.location.origin}/auth/callback`,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Store the email so the callback page can retrieve it on the same device
      // and avoid prompting the user again.
      window.localStorage.setItem(EMAIL_FOR_SIGN_IN_KEY, email);
      setStatus("sent");
    } catch (err) {
      setError(getErrorMessage((err as AuthError).code));
    } finally {
      setLoading(false);
    }
  };

  if (status === "sent") {
    return (
      <div className="min-h-screen bg-shodo-paper flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-4xl font-bold text-shodo-ink tracking-tight mb-8">
            AIGENKI
          </h1>
          <div className="border border-shodo-ink/20 rounded-lg p-6 space-y-3">
            <p className="text-shodo-ink font-medium">Check your email</p>
            <p className="text-shodo-ink/60 text-sm">
              We sent a sign-in link to{" "}
              <span className="font-medium text-shodo-ink">{email}</span>
            </p>
            <p className="text-shodo-ink/40 text-xs">
              Click the link in the email to sign in. You can close this tab.
            </p>
          </div>
          <button
            onClick={() => {
              setStatus("idle");
              setError(null);
            }}
            className="mt-5 text-sm text-shodo-ink/40 hover:text-shodo-ink/70 transition-colors duration-200"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-shodo-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-shodo-ink tracking-tight">
            AIGENKI
          </h1>
          <p className="text-shodo-ink/50 mt-2 text-sm">
            AI-Powered Japanese Learning
          </p>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-shodo-ink/70 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-shodo-ink/20 rounded-md bg-shodo-paper text-shodo-ink placeholder-shodo-ink/30 focus:outline-none focus:ring-1 focus:ring-shodo-ink/40 text-sm"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-shodo-ink text-shodo-paper rounded-md font-medium text-sm hover:bg-shodo-ink/85 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Sign-in Link"}
          </button>
        </form>

        <p className="text-center text-xs text-shodo-ink/30 mt-6">
          No password required — we&apos;ll email you a link.
        </p>
      </div>
    </div>
  );
}

function getErrorMessage(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "Invalid email address.";
    case "auth/operation-not-allowed":
      return "Email link sign-in is not enabled. Please contact support.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}
