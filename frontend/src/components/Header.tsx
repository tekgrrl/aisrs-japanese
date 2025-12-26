"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

/**
 * A simple navigation header that displays stats.
 * Now with a listener to refresh stats dynamically.
 */
export default function Header() {
  const [stats, setStats] = useState({ learnCount: 0, reviewsDue: 0 });

  // Wrap fetchStats in useCallback so it's a stable function
  // and can be safely used in useEffect dependency arrays.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/stats");
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
        fetchStats();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchStats]);

  // Effect to manage Furigana visibility and persistence
  const [showFurigana, setShowFurigana] = useState(false);

  useEffect(() => {
    // Load preference from localStorage
    const saved = localStorage.getItem("furiganaVisible");
    const isVisible = saved === "true";
    setShowFurigana(isVisible);

    // Apply initial class
    if (isVisible) {
      document.documentElement.setAttribute("data-furigana", "true");
    } else {
      document.documentElement.removeAttribute("data-furigana");
    }
  }, []);

  const toggleFurigana = useCallback(() => {
    const newState = !showFurigana;
    setShowFurigana(newState);
    localStorage.setItem("furiganaVisible", String(newState));

    if (newState) {
      document.documentElement.setAttribute("data-furigana", "true");
    } else {
      document.documentElement.removeAttribute("data-furigana");
    }
  }, [showFurigana]);

  // Effect for Keyboard Shortcut (Alt+F)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Alt+F (Option+F on Mac)
      if (
        event.altKey &&
        (event.key === "f" || event.key === "F" || event.code === "KeyF")
      ) {
        event.preventDefault();
        toggleFurigana();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFurigana]);

  return (
    <header className="bg-shodo-paper border-b border-shodo-ink/10 shadow-sm sticky top-0 z-10">
      <nav className="container mx-auto max-w-4xl px-8 py-4 flex items-center">
        <Link
          href="/"
          className="text-2xl font-bold text-shodo-ink hover:text-shodo-accent transition-colors duration-200 mr-auto"
        >
          AISRS
        </Link>
        
        {/* Navigation Links */}
        <div className="flex items-center space-x-2 sm:space-x-4">
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
          <Link
            href="/library"
            className="px-4 py-2 rounded-md text-shodo-ink font-medium hover:bg-shodo-ink/5 transition-colors duration-200"
          >
            Library
          </Link>
        </div>

        {/* Separator */}
        <div className="h-6 w-px bg-shodo-ink/30 mx-4 hidden sm:block" />

        {/* Settings / Toggles */}
        <button
          onClick={toggleFurigana}
          className={`text-sm font-medium transition-colors duration-200 flex items-center gap-2 ${
            showFurigana
              ? "text-shodo-ink"
              : "text-shodo-ink/40 hover:text-shodo-ink/70"
          }`}
          title="Toggle Furigana (Alt+F)"
          aria-pressed={showFurigana}
        >
          <span className="text-xs uppercase tracking-wider">Furigana</span>
          <div 
            className={`w-8 h-4 rounded-full relative transition-colors duration-200 ${
              showFurigana ? "bg-shodo-ink" : "bg-shodo-ink/20"
            }`}
          >
            <div 
              className={`absolute top-0.5 bottom-0.5 w-3 h-3 rounded-full bg-shodo-paper shadow-sm transition-all duration-200 ${
                showFurigana ? "left-4.5" : "left-0.5"
              }`}
            />
          </div>
        </button>
      </nav>
    </header>
  );
}
