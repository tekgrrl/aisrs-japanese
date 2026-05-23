"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { FacetType, UserRoot } from "@/types";

function formatFacetType(facet: FacetType): string {
  switch (facet) {
    case "Content-to-Definition":
      return "Definition";
    case "Definition-to-Content":
      return "Writing";
    case "Content-to-Reading":
      return "Reading";
    case "AI-Generated-Question":
      return "AI Question";
    case "Reading-to-Content":
      return "Writing from Reading";
    case "Kanji-Component-Meaning":
      return "Kanji Meaning";
    case "Kanji-Component-Reading":
      return "Kanji Reading";
    case "audio":
      return "Audio";
    case "sentence-assembly":
      return "Sentence Assembly";
    default:
      return facet;
  }
}

export default function StrugglingItemsWidget() {
  const [userDoc, setUserDoc] = useState<UserRoot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUserDoc(data);
        setError(null);
      } else {
        setError("Failed to fetch user context data");
      }
    } catch (err) {
      console.error("Error fetching user tutor context:", err);
      setError("An unexpected error occurred while fetching user context");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  // Listen to the refreshStats event to also refresh this widget's data
  useEffect(() => {
    const handleRefresh = () => {
      console.log(
        "StrugglingItemsWidget: Heard refreshStats event, refetching...",
      );
      fetchUserData();
    };

    window.addEventListener("refreshStats", handleRefresh);
    return () => {
      window.removeEventListener("refreshStats", handleRefresh);
    };
  }, [fetchUserData]);

  if (loading) {
    return (
      <div className="w-full rounded-2xl border-2 border-shodo-ink/10 bg-shodo-paper p-6 animate-pulse">
        <div className="h-6 w-48 bg-shodo-ink/10 rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="h-4 bg-shodo-ink/10 rounded w-1/2" />
            <div className="h-10 bg-shodo-ink/5 rounded" />
            <div className="h-10 bg-shodo-ink/5 rounded" />
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-shodo-ink/10 rounded w-1/2" />
            <div className="h-10 bg-shodo-ink/5 rounded" />
            <div className="h-10 bg-shodo-ink/5 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full rounded-2xl border-2 border-shodo-stamp-red/20 bg-shodo-paper p-6 text-center">
        <p className="text-shodo-stamp-red font-semibold mb-2">{error}</p>
        <button
          onClick={fetchUserData}
          type="button"
          className="px-4 py-2 bg-shodo-stamp-red hover:bg-shodo-stamp-red/90 text-white font-medium rounded-lg shadow-sm transition-all text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  const tutorContext = userDoc?.tutorContext;
  const leechVocab = tutorContext?.leechVocab || [];
  const weakGrammarPoints = tutorContext?.weakGrammarPoints || [];

  const hasStruggles = leechVocab.length > 0 || weakGrammarPoints.length > 0;

  return (
    <div className="w-full rounded-2xl border-2 border-shodo-ink/10 bg-shodo-paper p-6 transition-all duration-200 hover:border-shodo-ink/30 hover:shadow-md">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-shodo-ink/10 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-shodo-ink flex items-center gap-2">
            <span className="inline-block w-2.5 h-6 bg-shodo-stamp-red rounded-sm" />
            Study Focus &amp; Weak Areas
          </h2>
          <p className="text-xs text-shodo-ink-light mt-1">
            Vocabulary and grammar elements tracked by your AI tutor for extra
            reinforcement.
          </p>
        </div>
        {hasStruggles && (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-shodo-ink-light">
            <span className="inline-flex h-2 w-2 rounded-full bg-shodo-stamp-red animate-pulse" />
            Active Diagnosis
          </div>
        )}
      </div>

      {!hasStruggles ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="mb-4 text-5xl">🌿</div>
          <h3 className="text-base font-bold text-shodo-matcha mb-1">
            Your Understanding is Pristine
          </h3>
          <p className="text-sm text-shodo-ink-light max-w-md">
            No leeches or weak grammar points detected in your spaced repetition
            memory graph yet. Excellent work!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Vocab struggles (Leeches) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-shodo-ink-light uppercase tracking-wider flex items-center gap-1.5">
                Vocabulary Struggles ({leechVocab.length})
              </h3>
              <span className="text-[10px] bg-shodo-stamp-red/10 text-shodo-stamp-red px-2 py-0.5 rounded font-medium">
                Leeches
              </span>
            </div>

            {leechVocab.length === 0 ? (
              <p className="text-sm text-shodo-ink-faint italic py-4">
                No struggling vocabulary words.
              </p>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {leechVocab.map((entry) => (
                  <div
                    key={entry.content}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-shodo-ink/5 bg-shodo-paper-dark/30 hover:bg-shodo-paper-dark/60 transition-colors"
                  >
                    <span className="font-serif text-lg font-bold text-shodo-ink tracking-wide">
                      {entry.content}
                    </span>
                    {entry.facetTypes && entry.facetTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.facetTypes.map((facet) => (
                          <span
                            key={facet}
                            className="text-[10px] bg-shodo-stamp-red/10 text-shodo-stamp-red px-1.5 py-0.5 rounded font-medium"
                          >
                            {formatFacetType(facet)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Grammar struggles (Weak Grammar Points) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-shodo-ink-light uppercase tracking-wider flex items-center gap-1.5">
                Grammar Weaknesses ({weakGrammarPoints.length})
              </h3>
              <span className="text-[10px] bg-shodo-indigo/10 text-shodo-indigo px-2 py-0.5 rounded font-medium">
                Patterns
              </span>
            </div>

            {weakGrammarPoints.length === 0 ? (
              <p className="text-sm text-shodo-ink-faint italic py-4">
                No weak grammar points.
              </p>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {weakGrammarPoints.map((item) => {
                  const content =
                    typeof item === "string" ? item : item.content;
                  const facets =
                    typeof item === "string" ? [] : item.facetTypes || [];
                  return (
                    <div
                      key={content}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border border-shodo-ink/5 bg-shodo-paper-dark/30 hover:bg-shodo-paper-dark/60 transition-colors"
                    >
                      <span className="font-sans text-sm font-bold text-shodo-ink tracking-wide">
                        {content}
                      </span>
                      {facets.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {facets.map((facet) => (
                            <span
                              key={facet}
                              className="text-[10px] bg-shodo-indigo/10 text-shodo-indigo px-1.5 py-0.5 rounded font-medium"
                            >
                              {formatFacetType(facet)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
