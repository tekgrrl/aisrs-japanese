"use client"; // This must be a client component to use state and effects

import React, { useState, useEffect, FormEvent } from 'react';

// This matches the interface in our API route
// We should probably move this to a shared types file later
interface KnowledgeUnit {
  id: string;
  type: 'Vocab' | 'Kanji' | 'Grammar' | 'Concept' | 'ExampleSentence';
  content: string;
}

// Define the allowed KU types for our form's dropdown
const kuTypes: KnowledgeUnit['type'][] = [
  'Vocab',
  'Kanji',
  'Grammar',
  'Concept',
  'ExampleSentence',
];

export default function KnowledgeManagementPage() {
  // State for the list of KUs
  const [kus, setKus] = useState<KnowledgeUnit[]>([]);
  // State for the form inputs
  const [newKuType, setNewKuType] = useState<KnowledgeUnit['type']>('Vocab');
  const [newKuContent, setNewKuContent] = useState('');
  // State for loading and errors
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Data Fetching ---

  // Function to fetch all KUs from our API
  const fetchKUs = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const response = await fetch('/api/ku');
      if (!response.ok) {
        throw new Error('Failed to fetch knowledge units');
      }
      const data = await response.json();
      setKus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch KUs on component mount
  useEffect(() => {
    fetchKUs();
  }, []); // Empty dependency array means this runs once on mount

  // --- Form Handling ---

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); // Prevent default form submission (page reload)
    if (!newKuContent.trim()) {
      setError('Content cannot be empty');
      return;
    }

    try {
      const response = await fetch('/api/ku', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: newKuType,
          content: newKuContent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add new unit');
      }

      // Reset form and refresh list
      setNewKuContent('');
      setNewKuType('Vocab');
      await fetchKUs(); // Refetch the list to include the new item
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Render Logic ---

  const renderKuList = () => {
    if (isLoading) {
      return <p className="text-gray-400">Loading units...</p>;
    }
    if (error) {
      return <p className="text-red-400">Error: {error}</p>;
    }
    if (kus.length === 0) {
      return <p className="text-gray-400">No knowledge units added yet.</p>;
    }
    return (
      <ul className="space-y-3">
        {kus.map((ku) => (
          <li
            key={ku.id}
            className="flex items-center justify-between p-4 bg-gray-700 rounded-md"
          >
            <span className="font-mono text-sm bg-gray-900 px-2 py-1 rounded">
              {ku.type}
            </span>
            <span className="text-lg text-white">{ku.content}</span>
            <span className="text-xs text-gray-500 font-mono">{ku.id}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="container mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">AISRS</h1>
        <p className="text-xl text-gray-400">Your personal knowledge graph.</p>
      </header>

      {/* "Encounter & Capture" (Journey 1.1) form */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Add New Knowledge Unit</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="kuType" className="block text-sm font-medium text-gray-300 mb-1">
              Type
            </label>
            <select
              id="kuType"
              value={newKuType}
              onChange={(e) => setNewKuType(e.target.value as KnowledgeUnit['type'])}
              className="w-full p-3 bg-gray-700 border-gray-600 text-white rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              {kuTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="kuContent" className="block text-sm font-medium text-gray-300 mb-1">
              Content
            </label>
            <input
              type="text"
              id="kuContent"
              value={newKuContent}
              onChange={(e) => setNewKuContent(e.target.value)}
              placeholder="e.g., 食べる, 家族, 〜なければならない"
              className="w-full p-3 bg-gray-700 border-gray-600 text-white rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            className="w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            Add Unit
          </button>
        </form>
      </div>

      {/* "Explore & Connect" (Journey 1.3) list */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-semibold mb-4 text-white">My Knowledge Units</h2>
        {renderKuList()}
      </div>
    </main>
  );
}

