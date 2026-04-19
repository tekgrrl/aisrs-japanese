"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { ConceptKnowledgeUnit } from "@/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Bold + dotted underline — distinct from the red targetGrammar highlight
function highlightClause(text: string, target: string) {
  if (!target) return <span>{text}</span>;
  const parts = text.split(target);
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="font-bold underline decoration-dotted decoration-shodo-ink/60 underline-offset-2">
              {target}
            </span>
          )}
        </Fragment>
      ))}
    </>
  );
}

function highlightGrammar(text: string, target: string) {
  const parts = text.split(target);
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="bg-shodo-accent/15 text-shodo-accent rounded px-0.5 not-italic">
              {target}
            </mark>
          )}
        </Fragment>
      ))}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConceptPage() {
  const { id } = useParams<{ id: string }>();
  const [concept, setConcept] = useState<(ConceptKnowledgeUnit & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    console.log("[ConceptPage] Fetching concept id:", id);

    apiFetch(`/api/concepts/${id}`)
      .then((res) => {
        console.log("[ConceptPage] Response status:", res.status, res.statusText);
        if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        console.log("[ConceptPage] Raw response data:", data);
        console.log("[ConceptPage] data.type:", data?.type);
        console.log("[ConceptPage] data.data:", data?.data);
        console.log("[ConceptPage] data.data.mechanics:", data?.data?.mechanics);
        console.log("[ConceptPage] data.data.examples:", data?.data?.examples);
        setConcept(data as ConceptKnowledgeUnit & { id: string });
      })
      .catch((err) => {
        console.error("[ConceptPage] Fetch error:", err);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
        console.log("[ConceptPage] Fetch complete");
      });
  }, [id]);

  if (loading) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <p className="text-shodo-ink/50 animate-pulse">Loading concept…</p>
      </main>
    );
  }

  if (error || !concept) {
    return (
      <main className="container mx-auto max-w-3xl px-6 py-12">
        <p className="text-shodo-accent">
          {error ?? "Concept not found."}
        </p>
      </main>
    );
  }

  const { data } = concept;

  return (
    <main className="container mx-auto max-w-3xl px-6 py-12 space-y-14">

      {/* Header */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-widest text-shodo-accent mb-2">
          Grammar Concept
        </p>
        <h1 className="text-4xl font-bold text-shodo-ink mb-5">{data.title}</h1>
        <p className="text-base text-shodo-ink/70 leading-relaxed">{data.overview}</p>
      </section>

      {/* Mechanics */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-shodo-ink/40 mb-5">
          Rules of Use
        </h2>
        <div className="space-y-4">
          {data.mechanics.map((m, i) => (
            <div
              key={i}
              className="border border-shodo-ink/10 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-start gap-4">
                <span className="text-xs font-bold text-shodo-accent mt-0.5 shrink-0 w-5 text-right">
                  {i + 1}
                </span>
                <div className="space-y-3 flex-1">
                  <p className="font-semibold text-shodo-ink">{m.goalTitle}</p>
                  <p className="text-sm text-shodo-ink/50 italic">{m.englishIntent}</p>
                  <code className="block bg-shodo-ink/5 text-shodo-ink/80 font-mono text-sm rounded-lg px-4 py-2">
                    {m.rule}
                  </code>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-shodo-ink/30">Simple</p>
                      <p className="text-base text-shodo-ink">{highlightClause(m.simpleExample.japanese, m.simpleExample.highlight)}</p>
                      <p className="text-xs text-shodo-ink/50">{m.simpleExample.english}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-shodo-ink/30">Natural</p>
                      <p className="text-base text-shodo-ink">{highlightClause(m.naturalExample.japanese, m.naturalExample.highlight)}</p>
                      <p className="text-xs text-shodo-ink/50">{m.naturalExample.english}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Examples */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-shodo-ink/40 mb-5">
          Examples
        </h2>
        <div className="space-y-4">
          {data.examples.map((ex, i) => (
            <div
              key={i}
              className="border border-shodo-ink/10 rounded-xl px-6 py-5 space-y-2"
            >
              <p className="text-2xl text-shodo-ink leading-snug">
                {highlightGrammar(ex.japanese, ex.targetGrammar)}
              </p>
              <p className="text-sm text-shodo-ink/45 leading-snug">
                {ex.reading}
              </p>
              <p className="text-sm text-shodo-ink/65 border-t border-shodo-ink/8 pt-2 mt-2">
                {ex.english}
              </p>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}
