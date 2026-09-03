"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAudioPlayer } from "@/hooks/useAudioPlayer";
import {
  getAllEntries,
  deleteEntry,
  clearAll,
  isHistoryAvailable,
  type PronunciationEntry,
} from "@/lib/pronunciationHistory";

function voiceLabel(voiceId: string | null): string | null {
  if (!voiceId) return null;
  return voiceId.replace("ja-JP-Chirp3-HD-", "").replace("ja-JP-", "");
}

function formatSettings(entry: PronunciationEntry): string {
  const modePart = entry.mode === "clear" ? "Clear" : `Paced, ${entry.pauseMs}ms`;
  const voicePart = voiceLabel(entry.voiceUsed);
  return voicePart ? `${modePart} · ${voicePart}` : modePart;
}

export default function PronounceHistoryPage() {
  const [entries, setEntries] = useState<PronunciationEntry[] | null>(null);
  const { playBlob } = useAudioPlayer();

  useEffect(() => {
    if (!isHistoryAvailable()) {
      setEntries([]);
      return;
    }
    getAllEntries().then(setEntries);
  }, []);

  const handlePlay = (entry: PronunciationEntry) => {
    playBlob(new Blob([entry.audioBuffer], { type: entry.mimeType }));
  };

  const handleDelete = async (key: string) => {
    setEntries((prev) => (prev ? prev.filter((e) => e.key !== key) : prev));
    await deleteEntry(key);
  };

  const handleClearAll = async () => {
    if (!confirm("Delete all pronunciation history? This can't be undone.")) return;
    setEntries([]);
    await clearAll();
  };

  return (
    <main className="container mx-auto max-w-2xl p-8">
      <header className="mb-8 border-b border-shodo-ink/10 pb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-4xl font-bold text-shodo-stamp-red mb-2">
            History
          </h1>
          <Link
            href="/pronounce"
            className="text-sm text-shodo-ink/60 hover:text-shodo-ink transition-colors"
          >
            ← Back to Pronunciation
          </Link>
        </div>
        <p className="text-xl text-shodo-ink-light">
          Previously generated pronunciation audio.
        </p>
      </header>

      {!isHistoryAvailable() ? (
        <p className="text-shodo-ink-light">
          History isn't available in this browser.
        </p>
      ) : entries === null ? (
        <p className="text-shodo-ink-light">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-shodo-ink-light">
          Nothing here yet — generate some audio on the{" "}
          <Link href="/pronounce" className="underline hover:text-shodo-ink">
            Pronunciation
          </Link>{" "}
          page.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.key}
                className="flex items-center justify-between gap-4 p-4 bg-shodo-paper border border-shodo-ink/10 rounded-lg"
              >
                <div className="min-w-0">
                  <p className="text-lg text-shodo-ink truncate">{entry.text}</p>
                  <p className="text-xs text-shodo-ink/50 mt-1">
                    {formatSettings(entry)} · {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePlay(entry)}
                    className="px-4 py-2 border border-shodo-ink/15 text-shodo-ink/60 rounded-lg text-sm font-medium hover:bg-shodo-ink/5 transition-colors"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => handleDelete(entry.key)}
                    className="px-3 py-2 text-sm text-shodo-ink/40 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleClearAll}
            className="mt-6 text-sm text-shodo-ink/40 hover:text-red-600 transition-colors"
          >
            Clear all
          </button>
        </>
      )}
    </main>
  );
}
