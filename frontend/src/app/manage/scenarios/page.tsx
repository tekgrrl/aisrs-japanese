"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";

type Difficulty = "N5" | "N4" | "N3" | "N2" | "N1";

export default function ImportScenarioPage() {
  const router = useRouter();

  const [conversationText, setConversationText] = useState("");
  const [userRole, setUserRole] = useState("");
  const [aiRoles, setAiRoles] = useState<string[]>([""]);
  const [difficulty, setDifficulty] = useState<Difficulty>("N4");
  const [sceneNotes, setSceneNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filledAiRoles = aiRoles.filter((r) => r.trim());
  const isValid = conversationText.trim() && userRole.trim() && filledAiRoles.length > 0;

  const updateRole = (idx: number, value: string) => {
    setAiRoles((prev) => prev.map((r, i) => (i === idx ? value : r)));
  };

  const addRole = () => setAiRoles((prev) => [...prev, ""]);

  const removeRole = (idx: number) => {
    setAiRoles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch("/api/scenarios/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationText: conversationText.trim(),
          userRole: userRole.trim(),
          aiRoles: filledAiRoles.map((r) => r.trim()),
          difficulty,
          sceneNotes: sceneNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      router.push(`/scenarios/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed — please try again");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container mx-auto max-w-2xl px-6 py-12 space-y-8">
      <header>
        <Link href="/manage" className="text-sm text-shodo-ink/40 hover:text-shodo-ink/70 transition-colors mb-4 inline-block">
          ← Manage
        </Link>
        <h1 className="text-3xl font-bold text-shodo-ink">Import Conversation</h1>
        <p className="text-shodo-ink/50 mt-1">
          Paste a conversation from a textbook or real life. The AI will structure it into a practice scenario.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Conversation text */}
        <div>
          <label htmlFor="conversation" className="block text-sm font-medium text-shodo-ink mb-1.5">
            Conversation
          </label>
          <textarea
            id="conversation"
            value={conversationText}
            onChange={(e) => setConversationText(e.target.value)}
            rows={10}
            placeholder={"A: すみません、このシャツはいくらですか？\nB: 3000円です。\nA: 少し高いですね。もう少し安くなりますか？\nB: では、2500円にしましょう。\nA: ありがとうございます。"}
            className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-3 text-shodo-ink placeholder:text-shodo-ink/25 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors resize-y font-mono text-sm leading-relaxed"
            required
          />
          <p className="text-xs text-shodo-ink/40 mt-1">
            Use any speaker labels — A/B, names, numbers, or none. The AI will figure out who is who.
          </p>
        </div>

        {/* Roles */}
        <div className="space-y-3">
          <div>
            <label htmlFor="userRole" className="block text-sm font-medium text-shodo-ink mb-1.5">
              Your Role
            </label>
            <input
              type="text"
              id="userRole"
              value={userRole}
              onChange={(e) => setUserRole(e.target.value)}
              placeholder="e.g. Customer, Student, Tourist"
              className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors text-sm"
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-shodo-ink">
                Other Role{aiRoles.length > 1 ? "s" : ""}
              </label>
              <button
                type="button"
                onClick={addRole}
                className="text-xs text-shodo-accent hover:text-shodo-accent/70 transition-colors"
              >
                + Add another role
              </button>
            </div>
            <div className="space-y-2">
              {aiRoles.map((role, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => updateRole(idx, e.target.value)}
                    placeholder="e.g. Shop staff, Teacher, Friend"
                    className="flex-1 rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors text-sm"
                  />
                  {aiRoles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRole(idx)}
                      className="px-3 py-2.5 text-shodo-ink/30 hover:text-shodo-accent transition-colors text-sm"
                      aria-label="Remove role"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Difficulty */}
        <div>
          <label htmlFor="difficulty" className="block text-sm font-medium text-shodo-ink mb-1.5">
            JLPT Level
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            className="rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors text-sm"
          >
            {(["N5", "N4", "N3", "N2", "N1"] as Difficulty[]).map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Scene notes */}
        <div>
          <label htmlFor="sceneNotes" className="block text-sm font-medium text-shodo-ink mb-1.5">
            Scene Notes{" "}
            <span className="text-shodo-ink/40 font-normal">(optional)</span>
          </label>
          <textarea
            id="sceneNotes"
            value={sceneNotes}
            onChange={(e) => setSceneNotes(e.target.value)}
            rows={2}
            placeholder="e.g. 'Chapter 5 of Genki I — buying clothes at a department store'"
            className="w-full rounded-lg border border-shodo-ink/20 bg-shodo-paper px-4 py-2.5 text-shodo-ink placeholder:text-shodo-ink/30 focus:outline-none focus:ring-2 focus:ring-shodo-accent/50 focus:border-shodo-accent transition-colors resize-y text-sm"
          />
        </div>

        {error && (
          <p className="text-sm text-shodo-accent">{error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isValid || isSubmitting}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium text-shodo-paper transition-colors ${
              !isValid || isSubmitting
                ? "bg-shodo-ink/40 cursor-not-allowed"
                : "bg-shodo-ink hover:bg-shodo-ink/80"
            }`}
          >
            {isSubmitting ? "Structuring conversation…" : "Import Scenario"}
          </button>
        </div>
      </form>
    </main>
  );
}
