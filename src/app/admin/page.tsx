"use client";

import { useState, useEffect } from "react";
import { KnowledgeUnitClient } from "@/types";

export default function AdminPage() {
  const [knowledgeUnits, setKnowledgeUnits] = useState<KnowledgeUnitClient[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"status" | "createdAt">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const fetchKus = async () => {
      try {
        const res = await fetch("http://localhost:3500/knowledge-units/get-all");
        const data = await res.json();
        setKnowledgeUnits(data);
      } catch (error) {
        console.error("Failed to fetch knowledge units", error);
      } finally {
        setLoading(false);
      }
    };
    fetchKus();
  }, []);

  const sortedAndFilteredKus = knowledgeUnits
    .filter((ku) => ku.content.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "status") {
        const statusA = a.status || "";
        const statusB = b.status || "";
        return sortOrder === "asc"
          ? statusA.localeCompare(statusB)
          : statusB.localeCompare(statusA);
      } else {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
      }
    });

  const handleSort = (newSortBy: "status" | "createdAt") => {
    if (newSortBy === sortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortOrder("desc");
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin - Knowledge Units</h1>
      <div className="flex mb-4">
        <input
          type="text"
          placeholder="Search by content..."
          className="flex-grow p-2 border rounded-l-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex mb-4">
        <button
          className="p-2 border rounded-md mr-2"
          onClick={() => handleSort("status")}
        >
          Sort by Status{" "}
          {sortBy === "status" && (sortOrder === "asc" ? "▲" : "▼")}
        </button>
        <button
          className="p-2 border rounded-md"
          onClick={() => handleSort("createdAt")}
        >
          Sort by Created At{" "}
          {sortBy === "createdAt" && (sortOrder === "asc" ? "▲" : "▼")}
        </button>
      </div>
      <table className="min-w-full bg-white">
        <thead>
          <tr>
            <th className="py-2 px-4 border-b">Content</th>
            <th className="py-2 px-4 border-b">Status</th>
            <th className="py-2 px-4 border-b">Created At</th>
          </tr>
        </thead>
        <tbody>
          {sortedAndFilteredKus.map((ku) => (
            <tr key={ku.id}>
              <td className="py-2 px-4 border-b">{ku.content}</td>
              <td className="py-2 px-4 border-b">{ku.status}</td>
              <td className="py-2 px-4 border-b">
                {new Date(ku.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
