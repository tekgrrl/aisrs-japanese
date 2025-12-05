"use client";

import { useState, useEffect, useCallback } from "react";
import Lessons from "@/components/Lessons";
import Reviews from "@/components/Reviews";
import ReviewSchedule from "@/components/ReviewSchedule";

export default function DashboardPage() {
  const [stats, setStats] = useState({ 
    learnCount: 0, 
    reviewCount: 0,
    reviewsDue: 0,
    hourlyForecast: {},
    reviewForecast: {}
  });

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
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    const handleRefreshStats = () => {
      console.log("Dashboard: Heard refreshStats event, refetching...");
      fetchStats();
    };

    window.addEventListener("refreshStats", handleRefreshStats);

    return () => {
      window.removeEventListener("refreshStats", handleRefreshStats);
    };
  }, [fetchStats]);

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
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 dark:text-white">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="h-full">
          <Lessons lessonCount={stats.learnCount} />
        </div>
        <div className="h-full">
          <Reviews reviewsDue={stats.reviewsDue} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <div className="h-full">
          <ReviewSchedule 
            hourlyForecast={stats.hourlyForecast} 
            reviewForecast={stats.reviewForecast} 
            reviewsDue={stats.reviewsDue}
          />
        </div>
      </div>
    </div>
  );
}
