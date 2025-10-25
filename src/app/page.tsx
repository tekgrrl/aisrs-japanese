"use client";

import React, { useState, useEffect, FormEvent } from 'react';
// Import from shared types file
import { KnowledgeUnit, ReviewFacet } from '@/types';

const kuTypes: KnowledgeUnit['type'][] = [
  'Vocab',
  'Kanji',
  'Grammar',
  'Concept',
  'ExampleSentence',
];

export default function KnowledgeManagementPage() {
  const [kus, setKus] = useState<KnowledgeUnit[]>([]);
  // We'll also fetch and store facets to display them
  const [facets, setFacets] = useState<ReviewFacet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Form State ---
  const [newKuType, setNewKuType] =
    useState<KnowledgeUnit['type']>('Vocab');
  const [newKuContent, setNewKuContent] = useState('');
  const [newKuReading, setNewKuReading] = useState('');
  const [newKuDefinition, setNewKuDefinition] = useState('');
  const [newKuNotes, setNewKuNotes] = useState('');
  // State to track which KU is generating facets
  const [generatingFacetKuId, setGeneratingFacetKuId] = useState<
    string | null
  >(null);

  // --- Data Fetching ---
  const fetchData = async () => {
    try {
      setError(null);
      setIsLoading(true);

      // Fetch both KUs and Facets in parallel
      const [kuResponse, facetResponse] = await Promise.all([
        fetch('/api/ku'),
        fetch('/api/review-facets'),
      ]);

      if (!kuResponse.ok) throw new Error('Failed to fetch knowledge units');
      if (!facetResponse.ok)
        throw new Error('Failed to fetch review facets');

      const kuData = await kuResponse.json();
      const facetData = await facetResponse.json();

      setKus(kuData);
      setFacets(facetData);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Load data on initial mount
  useEffect(() => {
    fetchData();
  }, []);

  // --- Form Handling ---

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKuContent.trim()) {
      setError('Content cannot be empty');
      return;
    }

    let kuData: Record<string, string> = {};
    if (newKuType === 'Vocab') {
      kuData.reading = newKuReading;
      kuData.definition = newKuDefinition;
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
          data: kuData,
          personalNotes: newKuNotes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add new unit');
      }

      // Reset form fields
      setNewKuContent('');
      setNewKuType('Vocab');
      setNewKuReading('');
      setNewKuDefinition('');
      setNewKuNotes('');

      await fetchData(); // Refetch all data
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
    }
  };

  // --- New Facet Generation Handling ---
  const handleGenerateFacets = async (kuId: string) => {
    setGeneratingFacetKuId(kuId); // Set loading state for this button
    setError(null);
    try {
      const response = await fetch('/api/review-facets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kuId }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate facets');
      }

      await fetchData(); // Refetch all data to show new facets
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
    } finally {
      setGeneratingFacetKuId(null); // Clear loading state
    }
  };

  // --- Render Logic ---

  const renderKuList = () => {
    if (isLoading) {
      return <p className="text-center text-gray-400">Loading units...</p>;
    }
    // Only show top-level error here
    if (error && kus.length === 0) {
      return <p className="text-center text-red-400">Error: {error}</p>;
    }
    if (kus.length === 0) {
      return (
        <p className="text-center text-gray-400">
          No knowledge units added yet.
        </p>
      );
    }

    return (
      <ul className="space-y-4">
        {kus.map((ku) => {
          // Find facets for this specific KU
          const kuFacets = facets.filter((f) => f.kuId === ku.id);
          const isGenerating = generatingFacetKuId === ku.id;

          // --- UPDATED BUTTON TEXT LOGIC ---
          let generateButtonText = 'Generate Default Facets';
          if (ku.type === 'Grammar' || ku.type === 'Concept') {
            generateButtonText = 'Generate AI Quiz Facet';
          }
          // --- END UPDATED LOGIC ---

          return (
            <li
              key={ku.id}
              className="p-4 bg-gray-700 rounded-lg shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-semibold text-white break-all">
                  {ku.content}
                </span>
                <span className="font-mono text-sm bg-gray-900 px-2 py-1 rounded ml-2 flex-shrink-0">
                  {ku.type}
                </span>
              </div>

              {/* Conditionally show data based on what exists */}
              {ku.data && ku.data.reading && (
                <p className="text-lg text-gray-300 break-all">
                  <span className="font-semibold">Reading:</span>{' '}
                  {ku.data.reading}
                </p>
              )}
              {ku.data && ku.data.definition && (
                <p className="text-lg text-gray-300 break-all">
                  <span className="font-semibold">Definition:</span>{' '}
                  {ku.data.definition}
                </p>
              )}
              {ku.personalNotes && (
                <p className="mt-2 p-3 bg-gray-600 rounded text-gray-200 italic break-words">
                  {ku.personalNotes}
                </p>
              )}

              {/* --- Display existing facets --- */}
              <div className="mt-4 pt-4 border-t border-gray-600">
                <h4 className="text-sm font-semibold text-gray-400 mb-2">
                  Review Facets
                </h4>
                {kuFacets.length > 0 ? (
                  <ul className="space-y-1">
                    {kuFacets.map((facet) => (
                      <li
                        key={facet.id}
                        className="text-sm text-gray-300 flex justify-between items-center"
                      >
                        <span>{facet.facetType}</span>
                        <span className="text-xs font-mono bg-gray-600 px-2 py-0.5 rounded">
                          Stage: {facet.srsStage}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No facets generated.
                  </p>
                )}

                {/* --- Generate Facets Button --- */}
                {kuFacets.length === 0 && (
                  <button
                    onClick={() => handleGenerateFacets(ku.id)}
                    disabled={isGenerating}
                    className="mt-3 w-full px-3 py-2 bg-green-700 text-white text-sm font-semibold rounded-md shadow-md hover:bg-green-800 disabled:bg-gray-500 disabled:cursor-wait"
                  >
                    {isGenerating ? 'Generating...' : generateButtonText}
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-500 font-mono mt-3 break-all">
                {ku.id}
              </p>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <main className="container mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          Manage Knowledge
        </h1>
        <p className="text-xl text-gray-400">
          Your personal knowledge graph.
        </p>
      </header>

      {/* Show form-level error messages here */}
      {error && (
        <div className="bg-red-800 border border-red-600 text-red-100 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* "Encounter & Capture" (Journey 1.1) form */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">
          Add New Knowledge Unit
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* --- Core Fields --- */}
          <div>
            <label
              htmlFor="kuType"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Type
            </label>
            <select
              id="kuType"
              value={newKuType}
              onChange={(e) =>
                setNewKuType(e.target.value as KnowledgeUnit['type'])
              }
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
            <label
              htmlFor="kuContent"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
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

          {/* --- Conditional Fields: Vocab --- */}
          {newKuType === 'Vocab' && (
            <>
              <div>
                <label
                  htmlFor="kuReading"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Reading (Hiragana)
                </label>
                <input
                  type="text"
                  id="kuReading"
                  value={newKuReading}
                  onChange={(e) => setNewKuReading(e.target.value)}
                  placeholder="e.g., たべる, かぞく"
                  className="w-full p-3 bg-gray-700 border-gray-600 text-white rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="kuDefinition"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Definition
                </label>
                <input
                  type="text"
                  id="kuDefinition"
                  value={newKuDefinition}
                  onChange={(e) => setNewKuDefinition(e.target.value)}
                  placeholder="e.g., To eat, Family"
                  className="w-full p-3 bg-gray-700 border-gray-600 text-white rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* --- Common Fields --- */}
          <div>
            <label
              htmlFor="kuNotes"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Personal Notes
            </label>
            <textarea
              id="kuNotes"
              value={newKuNotes}
              onChange={(e) => setNewKuNotes(e.target.value)}
              rows={3}
              placeholder="e.g., Mnemonic, context where I found this, related to..."
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
        <h2 className="text-2xl font-semibold mb-4 text-white">
          My Knowledge Units
        </h2>
        {renderKuList()}
      </div>
    </main>
  );
}

