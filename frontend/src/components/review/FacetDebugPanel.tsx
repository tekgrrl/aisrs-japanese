"use client";

import { useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { apiFetch } from "@/lib/api-client";
import { JsonDisplay } from "@/components/JSONDisplay";
import { ReviewFacet, KnowledgeUnit } from "@/types";

interface Props {
  facet: ReviewFacet;
}

export default function FacetDebugPanel({ facet }: Props) {
  const { isAdmin } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [targetKu, setTargetKu] = useState<KnowledgeUnit | null>(null);
  const [originKu, setOriginKu] = useState<KnowledgeUnit | null>(null);
  const [userLevel, setUserLevel] = useState<string>("N5");
  const [note, setNote] = useState("");
  const [flagStatus, setFlagStatus] = useState<"idle" | "sending">("idle");
  const [flagMessage, setFlagMessage] = useState<string | null>(null);

  if (!isAdmin) return null;

  // Kanji-Component-* facets target the component kanji's own kuId but are
  // gated by the parent Vocab/Grammar word's sequence via source.id — surface
  // that distinction rather than only showing the facet's direct target.
  const originId = facet.source?.id && facet.source.id !== facet.kuId ? facet.source.id : null;

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !targetKu && !loading) {
      setLoading(true);
      try {
        const fetches: Promise<Response>[] = [
          apiFetch(`/api/knowledge-units/${facet.kuId}`),
          apiFetch(`/api/users/me`),
        ];
        if (originId) fetches.push(apiFetch(`/api/knowledge-units/${originId}`));

        const [kuRes, meRes, originRes] = await Promise.all(fetches);
        if (kuRes.ok) setTargetKu(await kuRes.json());
        if (meRes.ok) {
          const me = await meRes.json();
          setUserLevel(me?.preferences?.jlptLevel ?? "N5");
        }
        if (originRes?.ok) setOriginKu(await originRes.json());
      } finally {
        setLoading(false);
      }
    }
  };

  const handleFlag = async () => {
    if (!note.trim() || !targetKu) return;
    setFlagStatus("sending");
    try {
      const res = await apiFetch("/api/content-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "lesson",
          sourceId: originId ?? facet.kuId,
          kuId: facet.kuId,
          kuContent: targetKu.content,
          userLevel,
          manualNote: note,
        }),
      });
      if (!res.ok) throw new Error("Flag request failed");
      setFlagMessage("Flagged for content review.");
      setNote("");
    } catch {
      setFlagMessage("Something went wrong — try again.");
    } finally {
      setFlagStatus("idle");
      setTimeout(() => setFlagMessage(null), 2500);
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleToggle}
        className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
      >
        {expanded ? "▾" : "▸"} 🛠 Debug
      </button>

      {expanded && (
        <div className="mt-2 rounded-lg border border-gray-600 bg-gray-900 p-4 space-y-3 text-sm text-gray-300">
          {loading ? (
            <p className="text-gray-400">Loading…</p>
          ) : (
            <>
              <div className="space-y-1">
                <p>
                  <span className="text-gray-500">facetType:</span> {facet.facetType}
                </p>
                <p>
                  <span className="text-gray-500">srsStage:</span> {facet.srsStage}
                  {facet.sequenceStage !== undefined && (
                    <>
                      {" "}
                      · <span className="text-gray-500">sequenceStage:</span> {facet.sequenceStage}
                    </>
                  )}
                </p>
                <p>
                  <span className="text-gray-500">kuId:</span> {facet.kuId}
                  {targetKu && <span className="text-gray-400"> ({targetKu.content})</span>}
                </p>
                {originId && (
                  <p>
                    <span className="text-gray-500">originated from:</span> {originId}
                    {originKu && <span className="text-gray-400"> ({originKu.content})</span>}
                  </p>
                )}
              </div>

              {facet.data && <JsonDisplay data={facet.data} />}

              <div className="pt-2 border-t border-gray-700 space-y-2">
                {flagMessage ? (
                  <p className="text-sm text-green-300">{flagMessage}</p>
                ) : (
                  <>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What's wrong with this content?"
                      rows={2}
                      className="w-full rounded-md bg-gray-800 border border-gray-600 p-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleFlag}
                      disabled={flagStatus === "sending" || !note.trim()}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-medium rounded-md transition-colors"
                    >
                      Flag content quality
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
