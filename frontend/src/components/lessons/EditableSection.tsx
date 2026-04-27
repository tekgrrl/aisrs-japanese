"use client";

import React, { useState } from "react";

type EditableSectionProps = {
  title: string;
  content: string; // Or whatever type 'content' is
  sectionKey: string;
  onSave?: (sectionKey: string, newContent: string) => Promise<void>;
  readOnly?: boolean;
};

// A simple component to manage its own edit state
export default function EditableSection({
  title,
  content,
  sectionKey,
  onSave,
  readOnly = false,
}: EditableSectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(content));

  const handleSave = () => {
    if (onSave) {
      onSave(sectionKey, draft); // Call the main save handler
      setIsEditing(false); // Close the editor
    }
  };

  const handleEdit = () => {
    setDraft(String(content)); // Reset draft on edit
    setIsEditing(true);
  };

  if (isEditing && !readOnly) {
    // --- EDITING VIEW ---
    return (
      <div className="bg-gray-700 p-4 rounded-lg mb-8 border border-blue-500">
        <h2 className="text-2xl font-semibold mb-4 text-white">{title}</h2>
        <textarea
          className="w-full h-48 p-2 font-mono text-sm bg-gray-900 text-white rounded-md"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex justify-end space-x-2 mt-2">
          <button
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 bg-gray-600 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 rounded-md"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  // --- DEFAULT VIEW ---
  return (
    <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 relative border border-shodo-ink/10">
      {!readOnly && onSave && (
        <button
          onClick={handleEdit}
          className="absolute top-2 right-2 px-3 py-1 bg-shodo-paper text-shodo-ink-light text-xs rounded-md hover:bg-shodo-paper-warm"
        >
          Edit
        </button>
      )}
      <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
        {title}
      </h2>
      <p className="text-lg text-shodo-ink-light whitespace-pre-wrap">
        {String(content)}
      </p>
    </div>
  );
}
