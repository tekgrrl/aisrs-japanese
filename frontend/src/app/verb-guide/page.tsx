"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { GrammarSection } from "@/types";

interface SectionScenario {
  id: string;
  title: string;
  createdAt: unknown;
}

function SectionCard({ section }: { section: GrammarSection }) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scenarios, setScenarios] = useState<SectionScenario[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadScenarios = () => {
    apiFetch(`/api/scenarios?sourceSectionId=${encodeURIComponent(section.id)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: SectionScenario[]) => setScenarios(data))
      .catch(() => setScenarios([]));
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && scenarios === null) loadScenarios();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/scenarios/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "grammar-pattern",
          sourceSectionId: section.id,
          difficulty: section.jlptLevel ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      loadScenarios();
    } catch (err) {
      console.error("[verb-guide] generate failed", err);
      setError("Couldn't generate a scenario for this pattern. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="border border-shodo-ink/10 rounded-xl px-6 py-5 hover:border-shodo-ink/20 transition-colors">
      <button onClick={handleExpand} className="w-full flex items-start justify-between gap-4 text-left">
        <div className="min-w-0">
          <h3 className="font-semibold text-shodo-ink">{section.pattern}</h3>
          <p className="text-sm text-shodo-ink/50 mt-0.5">{section.sectionLabel}</p>
        </div>
        {section.jlptLevel && (
          <span className="shrink-0 text-xs border border-shodo-ink/10 text-shodo-ink/40 px-2 py-0.5 rounded-full">
            {section.jlptLevel}
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-shodo-ink/10 pt-4">
          <p className="text-sm text-shodo-ink-light">{section.explanation}</p>

          <div>
            <h4 className="text-xs font-semibold text-shodo-ink/40 uppercase tracking-wide mb-2">Examples</h4>
            <ul className="space-y-1.5">
              {section.examples.map((ex, i) => (
                <li key={i} className="text-sm">
                  <span className="text-shodo-ink">{ex.japanese}</span>
                  <span className="text-shodo-ink/50"> — {ex.english}</span>
                </li>
              ))}
            </ul>
          </div>

          {section.vocab && section.vocab.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-shodo-ink/40 uppercase tracking-wide mb-2">Word Check</h4>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-shodo-ink/70">
                {section.vocab.map((v, i) => (
                  <li key={i}>
                    {v.term}
                    {v.reading ? `（${v.reading}）` : ""}: {v.meaning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {section.notes && <p className="text-xs text-shodo-ink/50 italic">{section.notes}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 bg-shodo-ink text-shodo-paper rounded-lg text-sm font-medium hover:bg-shodo-ink/80 transition-colors disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate scenario"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {scenarios !== null && scenarios.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-semibold text-shodo-ink/40 uppercase tracking-wide mb-2">
                Scenarios for this pattern
              </h4>
              <ul className="space-y-1">
                {scenarios.map((s) => (
                  <li key={s.id}>
                    <Link href={`/scenarios/${s.id}`} className="text-sm text-shodo-accent hover:underline">
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VerbGuidePage() {
  const [sections, setSections] = useState<GrammarSection[] | null>(null);

  useEffect(() => {
    apiFetch("/api/grammar-sections")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GrammarSection[]) => setSections(data))
      .catch((err) => {
        console.error("[verb-guide] failed to load sections", err);
        setSections([]);
      });
  }, []);

  return (
    <div className="container mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-shodo-ink">Guide to Japanese Verbs</h1>
        <p className="text-shodo-ink/50 mt-0.5">
          Browse conjugation patterns from your reference guide, then generate a roleplay scenario built to
          practice each one.
        </p>
      </header>

      {sections === null ? (
        <p className="text-center py-20 text-shodo-ink/30 animate-pulse">Loading…</p>
      ) : sections.length === 0 ? (
        <p className="text-center py-10 text-shodo-ink/40">No sections yet.</p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      )}
    </div>
  );
}
