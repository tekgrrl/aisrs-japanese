"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export default function ConceptAdminPage() {
  const [topic, setTopic] = useState("Relative Clauses");
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    id?: string;
  } | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setResult(null);

    const body = { topic, notes: notes.trim() || undefined };
    console.log("[ConceptAdmin] Submitting generate request:", body);

    try {
      const response = await apiFetch("/api/concepts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      console.log("[ConceptAdmin] Response status:", response.status, response.statusText);

      const data = await response.json();
      console.log("[ConceptAdmin] Response body:", data);

      if (!response.ok) {
        throw new Error(data.message || "Failed to generate concept");
      }

      console.log("[ConceptAdmin] Success — Firestore document ID:", data.id);
      setResult({
        success: true,
        message: "Concept generated successfully!",
        id: data.id,
      });
    } catch (error: unknown) {
      console.error("[ConceptAdmin] Error:", error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="container mx-auto max-w-2xl px-8 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-shodo-accent mb-2">
        Admin
      </p>
      <h1 className="text-2xl font-bold text-shodo-ink mb-8 pb-4 border-b border-shodo-ink/10">
        Concept Generation
      </h1>

      <form onSubmit={handleGenerate} className="space-y-6">
        <div>
          <label
            htmlFor="topic"
            className="block text-sm font-medium text-shodo-ink mb-1.5"
          >
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
          <label
            htmlFor="notes"
            className="block text-sm font-medium text-shodo-ink mb-1.5"
          >
            Detailed Notes{" "}
            <span className="text-shodo-ink/40 font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            placeholder="Add any specific instructions, focus areas, or constraints you want the AI to follow — e.g. 'Focus on the past-tense form only' or 'Include a mechanic for negative relative clauses'."
            className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors resize-y font-sans text-sm leading-relaxed"
          />
        </div>

        <button
          type="submit"
          disabled={isGenerating}
          className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium text-shodo-paper transition-colors ${
            isGenerating
              ? "bg-shodo-ink/40 cursor-not-allowed"
              : "bg-shodo-ink hover:bg-shodo-ink/80"
          }`}
        >
          {isGenerating ? "Generating via Gemini…" : "Generate & Store Concept"}
        </button>
      </form>

      {result && (
        <div
          className={`mt-8 p-4 rounded-lg border ${
            result.success
              ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900"
              : "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900"
          }`}
        >
          <p
            className={`text-sm ${
              result.success ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"
            }`}
          >
            {result.message}
          </p>
          {result.id && (
            <p className="text-sm text-green-700 dark:text-green-400 mt-2 font-mono break-all">
              Document ID: {result.id}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
