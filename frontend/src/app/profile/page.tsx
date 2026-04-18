"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { UserAvatar } from "@/components/UserAvatar";
import { apiFetch } from "@/lib/api-client";
import { applyFurigana, loadFurigana } from "@/lib/furigana";

export default function ProfilePage() {
  const { user } = useAuth();
  const [showFurigana, setShowFurigana] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Apply from localStorage immediately to avoid flicker
    setShowFurigana(loadFurigana());

    // Then reconcile with the backend value
    apiFetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences?.showFurigana !== undefined) {
          const val = Boolean(data.preferences.showFurigana);
          setShowFurigana(val);
          applyFurigana(val);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleFurigana = useCallback(async () => {
    const newVal = !showFurigana;
    setShowFurigana(newVal);
    applyFurigana(newVal);

    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showFurigana: newVal }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // localStorage already updated; backend sync failed silently
    } finally {
      setSaving(false);
    }
  }, [showFurigana]);

  if (!user?.email) return null;

  return (
    <main className="container mx-auto max-w-2xl px-8 py-12">
      <h1 className="text-2xl font-bold text-shodo-ink mb-10">Profile</h1>

      {/* Identity */}
      <div className="flex items-center gap-5 mb-12">
        <UserAvatar email={user.email} size="lg" />
        <div>
          <p className="text-lg font-medium text-shodo-ink">{user.email}</p>
          <p className="text-sm text-shodo-ink/50">Learner</p>
        </div>
      </div>

      {/* Settings */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-shodo-ink/40 mb-4">
          Settings
        </h2>
        <div className="border border-shodo-ink/10 rounded-lg divide-y divide-shodo-ink/10">
          {/* Furigana toggle */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-shodo-ink">Show Furigana</p>
              <p className="text-xs text-shodo-ink/50 mt-0.5">
                Display reading aids above kanji — shortcut: Alt+F
              </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              {saving && (
                <span className="text-xs text-shodo-ink/40">Saving…</span>
              )}
              {saved && (
                <span className="text-xs text-green-600">Saved</span>
              )}
              <button
                onClick={handleToggleFurigana}
                role="switch"
                aria-checked={showFurigana}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-shodo-accent focus:ring-offset-2 ${
                  showFurigana ? "bg-shodo-ink" : "bg-shodo-ink/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-shodo-paper shadow-sm transition-all duration-200 ${
                    showFurigana ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
