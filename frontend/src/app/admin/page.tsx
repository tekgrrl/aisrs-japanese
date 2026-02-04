"use client";

import { useState, useEffect } from "react";
import { KnowledgeUnitClient, ReviewFacet } from "@/types";

// Extends ReviewFacet to handle stringified dates from JSON API
interface ReviewFacetClient extends Omit<ReviewFacet, "nextReviewAt" | "lastReviewAt" | "createdAt" | "history"> {
  nextReviewAt: string;
  lastReviewAt?: string;
  createdAt: string;
  history?: Array<{
    timestamp: string;
    result: "pass" | "fail";
    stage: number;
  }>;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"knowledge-units" | "review-facets" | "bulk-import">("knowledge-units");

  // Knowledge Units State
  const [knowledgeUnits, setKnowledgeUnits] = useState<KnowledgeUnitClient[]>([]);
  const [loadingKus, setLoadingKus] = useState(true);
  const [kuSearch, setKuSearch] = useState("");
  const [kuSortBy, setKuSortBy] = useState<"status" | "createdAt">("createdAt");
  const [kuSortOrder, setKuSortOrder] = useState<"asc" | "desc">("desc");

  // Review Facets State
  const [reviewFacets, setReviewFacets] = useState<ReviewFacetClient[]>([]);
  const [loadingFacets, setLoadingFacets] = useState(false);
  const [facetLoaded, setFacetLoaded] = useState(false); // To prevent refetching if already loaded
  const [facetSortBy, setFacetSortBy] = useState<"srsStage" | "nextReviewAt" | "kuId">("kuId");
  const [facetSortOrder, setFacetSortOrder] = useState<"asc" | "desc">("asc");

  // Bulk Import State
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);


  // Fetch KUs on mount
  useEffect(() => {
    const fetchKus = async () => {
      try {
        const res = await fetch("/api/knowledge-units/get-all");
        const data = await res.json();
        setKnowledgeUnits(data);
      } catch (error) {
        console.error("Failed to fetch knowledge units", error);
      } finally {
        setLoadingKus(false);
      }
    };
    fetchKus();
  }, []);

  // Fetch Facets when tab is active and not loaded
  useEffect(() => {
    if (activeTab === "review-facets" && !facetLoaded && !loadingFacets) {
      const fetchFacets = async () => {
        setLoadingFacets(true);
        try {
          const res = await fetch("/api/reviews/facets");
          const data = await res.json();
          setReviewFacets(data);
          setFacetLoaded(true);
        } catch (error) {
          console.error("Failed to fetch review facets", error);
        } finally {
          setLoadingFacets(false);
        }
      };
      fetchFacets();
    }
  }, [activeTab, facetLoaded]);

  // --- KU Logic ---
  const sortedAndFilteredKus = knowledgeUnits
    .filter((ku) => ku.content.toLowerCase().includes(kuSearch.toLowerCase()))
    .sort((a, b) => {
      if (kuSortBy === "status") {
        const statusA = a.status || "";
        const statusB = b.status || "";
        return kuSortOrder === "asc"
          ? statusA.localeCompare(statusB)
          : statusB.localeCompare(statusA);
      } else {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return kuSortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
    });

  const handleKuSort = (newSortBy: "status" | "createdAt") => {
    if (newSortBy === kuSortBy) {
      setKuSortOrder(kuSortOrder === "asc" ? "desc" : "asc");
    } else {
      setKuSortBy(newSortBy);
      setKuSortOrder("desc");
    }
  };

  // --- Facet Logic ---

  // Helper to get KU Content
  const getKuContent = (kuId: string) => {
    const ku = knowledgeUnits.find(k => k.id === kuId);
    return ku ? ku.content : kuId; // Fallback to ID if not found (shouldn't happen if KUs loaded)
  };

  // Calculate passes/fails
  const getProgress = (facet: ReviewFacetClient) => {
    if (!facet.history) return { passes: 0, fails: 0 };
    const passes = facet.history.filter(h => h.result === 'pass').length;
    const fails = facet.history.filter(h => h.result === 'fail').length;
    return { passes, fails };
  };

  const sortedFacets = [...reviewFacets]
    .sort((a, b) => {
      // Group by KU/Sort by KU content
      if (facetSortBy === "kuId") {
        const contentA = getKuContent(a.kuId);
        const contentB = getKuContent(b.kuId);
        return facetSortOrder === "asc"
          ? contentA.localeCompare(contentB)
          : contentB.localeCompare(contentA);
      } else if (facetSortBy === "srsStage") {
        return facetSortOrder === "asc"
          ? a.srsStage - b.srsStage
          : b.srsStage - a.srsStage;
      } else {
        const dateA = new Date(a.nextReviewAt).getTime();
        const dateB = new Date(b.nextReviewAt).getTime();
        return facetSortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
    });

  const handleFacetSort = (newSortBy: "srsStage" | "nextReviewAt" | "kuId") => {
    if (newSortBy === facetSortBy) {
      setFacetSortOrder(facetSortOrder === "asc" ? "desc" : "asc");
    } else {
      setFacetSortBy(newSortBy);
      setFacetSortOrder("asc"); // Default asc for text/numbers usually
    }
  };

  // --- Bulk Import Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus("Reading file...");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let items: string[] = [];

        if (file.name.endsWith('.json')) {
          const json = JSON.parse(text);
          if (Array.isArray(json.items)) {
            items = json.items;
          } else if (Array.isArray(json)) {
            items = json; // support simple array
          } else {
            throw new Error("Invalid JSON format. Expected { items: string[] } or string[]");
          }
        } else {
          // Assume CSV/Text - split by newline or comma
          items = text.split(/[\n,]+/).map(s => s.trim()).filter(s => s.length > 0);
        }

        if (items.length === 0) {
          setImportStatus("No items found in file.");
          setIsImporting(false);
          return;
        }

        setImportStatus(`Sending ${items.length} items to backend...`);
        console.log(`items: ${JSON.stringify(items)}`);

        const res = await fetch('/api/lessons/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });

        if (!res.ok) {
          throw new Error(`Server error: ${res.statusText}`);
        }

        const data = await res.json();
        setImportStatus(`Success! Batch processing started for ${data.count} items.`);

      } catch (error) {
        console.error("Import failed", error);
        setImportStatus(`Error: ${(error as Error).message}`);
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsText(file);
  };


  if (loadingKus) {
    return <div className="p-4">Loading Knowledge Units...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      {/* Header and Tabs */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Admin</h1>
        <div className="flex border-b border-gray-200">
          <button
            className={`py-2 px-4 font-medium focus:outline-none ${activeTab === 'knowledge-units' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('knowledge-units')}
          >
            Knowledge Units
          </button>
          <button
            className={`py-2 px-4 font-medium focus:outline-none ${activeTab === 'review-facets' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('review-facets')}
          >
            Review Facets
          </button>
          <button
            className={`py-2 px-4 font-medium focus:outline-none ${activeTab === 'bulk-import' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('bulk-import')}
          >
            Bulk Import
          </button>
        </div>
      </div>

      {/* Tab Content: Knowledge Units */}
      {activeTab === 'knowledge-units' && (
        <div>
          <div className="flex mb-4 gap-2">
            <input
              type="text"
              placeholder="Search by content..."
              className="flex-grow p-2 border rounded-md"
              value={kuSearch}
              onChange={(e) => setKuSearch(e.target.value)}
            />

            <button
              className="p-2 border rounded-md px-4 hover:bg-gray-50"
              onClick={() => handleKuSort("status")}
            >
              Sort by Status{" "}
              {kuSortBy === "status" && (kuSortOrder === "asc" ? "▲" : "▼")}
            </button>
            <button
              className="p-2 border rounded-md px-4 hover:bg-gray-50"
              onClick={() => handleKuSort("createdAt")}
            >
              Sort by Created At{" "}
              {kuSortBy === "createdAt" && (kuSortOrder === "asc" ? "▲" : "▼")}
            </button>
          </div>

          <div className="overflow-x-auto shadow rounded-lg border">
            <table className="min-w-full bg-white divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Content</th>
                  <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Status</th>
                  <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedAndFilteredKus.map((ku) => (
                  <tr key={ku.id}>
                    <td className="py-2 px-6 whitespace-nowrap">{ku.content}</td>
                    <td className="py-2 px-6 whitespace-nowrap">{ku.status}</td>
                    <td className="py-2 px-6 whitespace-nowrap">
                      {new Date(ku.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Review Facets */}
      {activeTab === 'review-facets' && (
        <div>
          {loadingFacets ? (
            <div>Loading Facets...</div>
          ) : (
            <>
              <div className="flex justify-end mb-4 gap-2">
                {/* Add Sort controls if needed, default is by KU */}
                <button onClick={() => handleFacetSort('kuId')} className="text-sm text-gray-600 hover:text-black">
                  Sort by KU {facetSortBy === 'kuId' && (facetSortOrder === 'asc' ? '▲' : '▼')}
                </button>
                <button onClick={() => handleFacetSort('srsStage')} className="text-sm text-gray-600 hover:text-black">
                  Sort by SRS {facetSortBy === 'srsStage' && (facetSortOrder === 'asc' ? '▲' : '▼')}
                </button>
              </div>
              <div className="overflow-x-auto shadow rounded-lg border">
                <table className="min-w-full bg-white divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KU</th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Facet Type</th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SRS Stage</th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress (P/F)</th>
                      <th className="py-3 px-6 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Next Review</th>

                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedFacets.map((facet) => {
                      const { passes, fails } = getProgress(facet);
                      return (
                        <tr key={facet.id} className="hover:bg-gray-50">
                          <td className="py-2 px-6 whitespace-nowrap font-medium">{getKuContent(facet.kuId)}</td>
                          <td className="py-2 px-6 whitespace-nowrap text-sm text-gray-600">{facet.facetType}</td>
                          <td className="py-2 px-6 whitespace-nowrap text-sm">{facet.srsStage}</td>
                          <td className="py-2 px-6 whitespace-nowrap text-sm">
                            <span className="text-green-600">{passes}</span> / <span className="text-red-600">{fails}</span>
                          </td>
                          <td className="py-2 px-6 whitespace-nowrap text-sm text-gray-500">
                            {new Date(facet.nextReviewAt).toLocaleString()}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab Content: Bulk Import */}
      {activeTab === 'bulk-import' && (
        <div className="max-w-xl">
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-xl font-semibold mb-4">Bulk Import Vocabulary</h2>
            <p className="text-gray-600 mb-4">
              Upload a JSON file (<code>&#123; "items": ["word1", "word2"] &#125;</code>) or a CSV/Text file (one word per line).
              These items will be queued for lesson generation in the background.
            </p>

            <div className="mb-4">
              <input
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="block w-full text-sm text-gray-500
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-full file:border-0
                             file:text-sm file:font-semibold
                             file:bg-blue-50 file:text-blue-700
                             hover:file:bg-blue-100"
              />
            </div>

            {importStatus && (
              <div className={`p-4 rounded-md ${importStatus.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {importStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
