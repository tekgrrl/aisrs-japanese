"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { KnowledgeUnit } from "@/types";

export default function LearnListPage() {
  const [learningItems, setLearningItems] = useState<KnowledgeUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchLearningItems = async () => {
      // TODO use backend service instead of calling Firestore directly

      try {

        const response = await fetch("/api/knowledge-units/get-all?status=learning", {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(response.statusText);

        const data = (await response.json()) as KnowledgeUnit[]; // Cast here

        const items = data.map(
          (thing: KnowledgeUnit) => ({ ...thing }) as KnowledgeUnit,
        );

        setLearningItems(items);
      } catch (err: any) {
        if (err.name === 'AbortError') {
            return;
        } 
        setError(err.message || "Failed to fetch");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLearningItems();
    return () => controller.abort();
  }, []);

  const renderList = () => {
    if (isLoading) {
      return <p className="text-gray-400">Loading learning items...</p>;
    }
    if (error) {
      return <p className="text-red-400">Error: {error}</p>;
    }
    if (learningItems.length === 0) {
      return <p className="text-gray-400">Your learning queue is empty.</p>;
    }

    return (
      <ul className="space-y-4">
        {learningItems.map((ku) => (
          <li key={ku.id}>
            <Link
              href={`/learn/${ku.id}`}
              className="block p-6 bg-gray-800 rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-3xl font-bold text-white">
                  {ku.content}
                </span>
                <span className="font-mono text-sm bg-gray-900 text-gray-100 px-2 py-1 rounded">
                  {ku.type}
                </span>
              </div>
              {ku.personalNotes && (
                <p className="mt-2 text-gray-300 italic">{ku.personalNotes}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="container mx-auto max-w-4xl p-8">
      <h1 className="text-4xl font-bold text-white mb-6">Learning Queue</h1>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">{renderList()}</div>
    </main>
  );
}
