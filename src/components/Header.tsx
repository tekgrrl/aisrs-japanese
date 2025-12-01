"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

/**
 * A simple navigation header that displays stats.
 * Now with a listener to refresh stats dynamically.
 */
export default function Header() {
  const [stats, setStats] = useState({ learnCount: 0, reviewCount: 0 });

  console.log("Re-running component code");
  // Wrap fetchStats in useCallback so it's a stable function
  // and can be safely used in useEffect dependency arrays.
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3500/stats");
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []); // Empty dependency array, this function never needs to change.

  // Effect to fetch stats on initial mount
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Effect to listen for our custom 'refreshStats' event
  useEffect(() => {
    // We define a handler function to be clear
    const handleRefreshStats = () => {
      console.log("Header: Heard refreshStats event, refetching...");
      fetchStats();
    };

    window.addEventListener("refreshStats", handleRefreshStats);

    // Clean up the listener when the component unmounts
    return () => {
      window.removeEventListener("refreshStats", handleRefreshStats);
    };
  }, [fetchStats]); // Depend on fetchStats

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("Page has become visible, refreshing stats...");
        fetchStats();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchStats]);

  return (
    <header className="bg-gray-800 shadow-md sticky top-0 z-10">
      <nav className="container mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-bold text-white hover:text-gray-300"
        >
          AISRS
        </Link>
        <div className="space-x-2 sm:space-x-4">
          <Link
            href="/learn"
            className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white"
          >
            Learn ({stats.learnCount})
          </Link>
          <Link
            href="/review"
            className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white"
          >
            Review ({stats.reviewCount})
          </Link>
          <Link
            href="/"
            className="bg-gray-700 px-4 py-2 rounded-md hover:bg-gray-600 text-white"
          >
            Manage
          </Link>
        </div>
      </nav>
    </header>
  );
}
