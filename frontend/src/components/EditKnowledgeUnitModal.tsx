"use client";

import React, { useState, useEffect } from "react";
import { KnowledgeUnit } from "@/types";

interface EditKnowledgeUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<KnowledgeUnit>) => Promise<void>;
  knowledgeUnit: KnowledgeUnit | null;
}

export default function EditKnowledgeUnitModal({
  isOpen,
  onClose,
  onSave,
  knowledgeUnit,
}: EditKnowledgeUnitModalProps) {
  const [content, setContent] = useState("");
  const [reading, setReading] = useState("");
  const [definition, setDefinition] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (knowledgeUnit) {
      setContent(knowledgeUnit.content || "");
      setReading(knowledgeUnit.data?.reading || "");
      setDefinition(knowledgeUnit.data?.definition || "");
      setUserNotes(knowledgeUnit.userNotes || "");
      setPersonalNotes(knowledgeUnit.personalNotes || "");
    }
  }, [knowledgeUnit]);

  if (!isOpen || !knowledgeUnit) return null;

  const hasChanges = () => {
    if (!knowledgeUnit) return false;
    const currentReading = knowledgeUnit.data?.reading || "";
    const currentDefinition = knowledgeUnit.data?.definition || "";
    const currentUserNotes = knowledgeUnit.userNotes || "";
    const currentPersonalNotes = knowledgeUnit.personalNotes || "";

    return (
      content !== knowledgeUnit.content ||
      reading !== currentReading ||
      definition !== currentDefinition ||
      userNotes !== currentUserNotes ||
      personalNotes !== currentPersonalNotes
    );
  };

  const handleSave = async () => {
    if (!hasChanges()) return;

    setIsSaving(true);
    try {
      const updates: Partial<KnowledgeUnit> = {
        content,
        data: {
          ...knowledgeUnit.data,
          reading,
          definition,
        },
        userNotes,
        personalNotes,
      };
      await onSave(knowledgeUnit.id, updates);
      onClose();
    } catch (error) {
      console.error("Failed to save changes", error);
      // Ideally show error to user
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-shodo-paper w-full max-w-2xl rounded-lg shadow-xl border border-shodo-ink-light overflow-hidden">
        {/* Header */}
        <div className="bg-shodo-paper-dark px-6 py-4 border-b border-shodo-mist flex justify-between items-center">
          <h2 className="text-xl font-bold text-shodo-ink font-sans">
            Edit Knowledge Unit
          </h2>
          <button
            onClick={onClose}
            className="text-shodo-ink-light hover:text-shodo-stamp-red transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
          {/* Metadata Row */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
                Type
              </label>
              <div className="px-3 py-2 bg-shodo-mist rounded text-shodo-ink-light font-mono text-sm">
                {knowledgeUnit.type}
              </div>
            </div>
            <div className="flex-[2]">
              <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
                ID
              </label>
              <div className="px-3 py-2 bg-shodo-mist rounded text-shodo-ink-light font-mono text-xs truncate">
                {knowledgeUnit.id}
              </div>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
              Content
            </label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-shodo-mist rounded text-gray-900 focus:outline-none focus:border-shodo-indigo text-lg"
            />
          </div>

          {/* Vocab Specific Fields */}
          {knowledgeUnit.type === "Vocab" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
                  Reading
                </label>
                <input
                  type="text"
                  value={reading}
                  onChange={(e) => setReading(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-shodo-mist rounded text-gray-900 focus:outline-none focus:border-shodo-indigo"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
                  Definition
                </label>
                <input
                  type="text"
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-shodo-mist rounded text-gray-900 focus:outline-none focus:border-shodo-indigo"
                />
              </div>
            </div>
          )}

          {/* User Notes (Context for AI) */}
          <div>
            <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1 flex items-center gap-2">
              User Notes
              <span className="text-[10px] bg-shodo-indigo text-white px-1.5 py-0.5 rounded-full font-normal normal-case">
                AI Context
              </span>
            </label>
            <p className="text-xs text-shodo-ink-light mb-2">
              Provide context for the AI (e.g., "Focus on polite forms", "Medical terminology").
            </p>
            <textarea
              rows={2}
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-shodo-mist rounded text-gray-900 focus:outline-none focus:border-shodo-indigo resize-none"
              placeholder="Context instructions for Gemini..."
            />
          </div>

          {/* Personal Notes (Private) */}
          <div>
            <label className="block text-xs font-bold text-shodo-ink-light uppercase tracking-wide mb-1">
              Personal Notes
            </label>
            <textarea
              rows={3}
              value={personalNotes}
              onChange={(e) => setPersonalNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-shodo-mist rounded text-gray-900 focus:outline-none focus:border-shodo-indigo"
              placeholder="Your private study notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-shodo-paper-dark border-t border-shodo-mist flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-shodo-ink-light hover:text-shodo-ink hover:bg-shodo-mist transition-colors font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges() || isSaving}
            className={`px-4 py-2 rounded text-white font-medium text-sm shadow-sm transition-all
              ${
                hasChanges() && !isSaving
                  ? "bg-red-600 hover:bg-red-700 hover:shadow-md transform hover:-translate-y-0.5"
                  : "bg-gray-400 cursor-not-allowed"
              }
            `}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
