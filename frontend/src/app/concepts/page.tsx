"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { ConceptKnowledgeUnit } from "@/types";

interface UserConceptEntry {
  id: string;
  conceptId: string;
  startedAt: { _seconds: number };
  lastSeenAt?: { _seconds: number };
  concept: ConceptKnowledgeUnit & { id: string };
}

export default function ConceptsDashboard() {
  const router = useRouter();

  // Form state
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Recent activity state
  const [recentConcepts, setRecentConcepts] = useState<UserConceptEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/user-concepts")
      .then((res) => res.json())
      .then((data: UserConceptEntry[]) => setRecentConcepts(data.slice(0, 8)))
      .catch((err) => console.error("[Concepts] Failed to fetch user concepts:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await apiFetch("/api/concepts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), notes: notes.trim() || undefined }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Generation failed");

      router.push(`/concepts/${data.id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "An unknown error occurred");
      setIsGenerating(false);
    }
  };

  return (
    <main className="container mx-auto max-w-4xl px-6 py-12 space-y-10">

      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-shodo-ink">Concepts</h1>
          <p className="text-shodo-ink/50 mt-1">Grammar &amp; Structure</p>
        </div>
        <Link href="/concepts/library">
          <button className="px-4 py-2 bg-shodo-ink/5 hover:bg-shodo-ink/10 text-shodo-ink/70 rounded-lg font-medium transition-colors text-sm border border-shodo-ink/10">
            Full Library
          </button>
        </Link>
      </header>

      {/* Generate Form */}
      <section className="border border-shodo-ink/10 rounded-xl p-6 space-y-5">
        <h2 className="text-base font-semibold text-shodo-ink">Generate New Concept</h2>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <label htmlFor="topic" className="block text-sm font-medium text-shodo-ink mb-1.5">
              Grammar Topic
            </label>
            <input
              type="text"
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Relative Clauses, て-form, Causative Passive"
              className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors"
              required
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-shodo-ink mb-1.5">
              Detailed Notes{" "}
              <span className="text-shodo-ink/40 font-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add any specific instructions, focus areas, or constraints — e.g. 'Focus on the past-tense form only'."
              className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors resize-y font-sans text-sm leading-relaxed"
            />
          </div>

          {generateError && (
            <p className="text-sm text-shodo-accent">{generateError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isGenerating}
              className={`px-6 py-2.5 rounded-lg text-sm font-medium text-shodo-paper transition-colors ${
                isGenerating
                  ? "bg-shodo-ink/40 cursor-not-allowed"
                  : "bg-shodo-ink hover:bg-shodo-ink/80"
              }`}
            >
              {isGenerating ? "Generating via Gemini…" : "Generate Concept"}
            </button>
          </div>
        </form>
      </section>

      {/* Recent Activity */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-shodo-ink">Recent Activity</h2>

        {loading ? (
          <p className="text-shodo-ink/40 animate-pulse py-6 text-center">Loading…</p>
        ) : recentConcepts.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-shodo-ink/15 rounded-xl">
            <p className="text-shodo-ink/40">No concepts yet.</p>
            <p className="text-shodo-ink/30 text-sm mt-1">
              Generate one above or browse the{" "}
              <Link href="/concepts/library" className="text-shodo-accent hover:underline">
                Full Library
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentConcepts.map((entry) => (
              <Link key={entry.id} href={`/concepts/${entry.conceptId}`} className="block group">
                <div className="border border-shodo-ink/10 rounded-xl px-5 py-4 hover:border-shodo-ink/25 hover:bg-shodo-ink/[0.02] transition-all">
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-shodo-ink group-hover:text-shodo-accent transition-colors truncate">
                        {entry.concept.data.title}
                      </h3>
                      <p className="text-sm text-shodo-ink/50 mt-0.5 line-clamp-1">
                        {entry.concept.data.overview}
                      </p>
                    </div>
                    <span className="text-xs text-shodo-ink/30 shrink-0 mt-0.5">Grammar</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
