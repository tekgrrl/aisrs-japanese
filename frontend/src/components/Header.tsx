"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

/**
 * A simple navigation header that displays stats.
 * Now with a listener to refresh stats dynamically.
 */
export default function Header() {
  const [stats, setStats] = useState({ learnCount: 0, reviewsDue: 0 });

  console.log("Fetching stats...");
  // Wrap fetchStats in useCallback so it's a stable function
  // and can be safely used in useEffect dependency arrays.
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/stats");
      if (response.ok) {
        const data = await response.json();
        console.log("Fetched stats:", data);
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
    <header className="bg-shodo-paper border-b border-shodo-ink/10 shadow-sm sticky top-0 z-10">
      <nav className="container mx-auto max-w-4xl px-8 py-4 flex items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-bold text-shodo-ink hover:text-shodo-accent transition-colors duration-200"
        >
          AISRS
        </Link>
        <div className="space-x-2 sm:space-x-4">
          <Link
            href="/learn"
            className="px-4 py-2 rounded-md text-shodo-ink font-medium hover:bg-shodo-ink/5 transition-colors duration-200"
          >
            Learn ({stats.learnCount})
          </Link>
          <Link
            href="/review"
            className="px-4 py-2 rounded-md text-shodo-ink font-medium hover:bg-shodo-ink/5 transition-colors duration-200"
          >
            Review ({stats.reviewsDue})
          </Link>
          <Link
            href="/manage"
            className="px-4 py-2 rounded-md text-shodo-ink font-medium hover:bg-shodo-ink/5 transition-colors duration-200"
          >
            Manage
          </Link>
        </div>
      </nav>
    </header>
  );
}
