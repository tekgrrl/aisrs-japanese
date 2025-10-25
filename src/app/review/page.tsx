"use client";

import React, { useState, useEffect } from 'react';
import { ReviewFacet } from '@/types'; // Import from shared types

/**
 * Page for running a review session (Phase 4.1)
 */
export default function ReviewPage() {
  const [reviewQueue, setReviewQueue] = useState<ReviewFacet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetches the review queue when the page loads
    const fetchReviewQueue = async () => {
      try {
        setError(null);
        setIsLoading(true);
        // For now, we fetch ALL facets.
        // Later, this will be `/api/review-facets?due=true`
        const response = await fetch('/api/review-facets');
        if (!response.ok) {
          throw new Error('Failed to fetch review queue');
        }
        const data: ReviewFacet[] = await response.json();
        
        // TODO: In a real app, we'd also fetch the associated KU data
        // for each facet to be able to show the question (e.g., ku.content)
        
        setReviewQueue(data);
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReviewQueue();
  }, []);

  // Renders the main content of the review page
  const renderReviewSession = () => {
    if (isLoading) {
      return <p className="text-center text-gray-400">Loading review queue...</p>;
    }
    if (error) {
      return <p className="text-center text-red-400">Error: {error}</p>;
    }
    if (reviewQueue.length === 0) {
      return (
        <div className="text-center p-8">
          <p className="text-2xl font-semibold text-gray-200">Review Queue Empty!</p>
          <p className="text-gray-400 mt-2">
            Go to the 'Manage' page to add Knowledge Units and generate their review facets.
          </p>
        </div>
      );
    }

    // This is the placeholder for our actual review UI
    return (
      <div>
        <h2 className="text-2xl font-semibold mb-4 text-white">
          Review Items ({reviewQueue.length})
        </h2>
        <p className="text-gray-400 mb-6">
          This is a placeholder list of all created review facets. The next step is to
          build the interactive review UI here.
        </p>
        <ul className="space-y-2">
          {reviewQueue.map(facet => (
            <li key={facet.id} className="p-4 bg-gray-700 rounded-lg shadow">
              <p className="font-semibold text-white">{facet.facetType}</p>
              <p className="text-sm text-gray-300">KU ID: {facet.kuId}</p>
              <p className="text-sm text-gray-400">
                Next Review: {new Date(facet.nextReviewAt).toLocaleString()}
              </p>
              <span className="text-xs font-mono bg-gray-600 px-2 py-0.5 rounded mt-2 inline-block">
                Stage: {facet.srsStage}
              </span>
            </li>
          ))}
        </ul>
        <button 
          disabled
          className="mt-6 w-full px-4 py-3 bg-green-800 text-gray-400 font-semibold rounded-md shadow-md cursor-not-allowed"
        >
          Start Review (Not Implemented)
        </button>
      </div>
    );
  }

  return (
    <main className="container mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Review Session</h1>
        <p className="text-xl text-gray-400">Time to train your brain.</p>
      </header>
      
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
        {renderReviewSession()}
      </div>
    </main>
  );
}
