import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface ReviewScheduleProps {
  nextReviewAt: string | null;
  schedule: {
    date: string;
    isToday: boolean;
    count: number;
    runningTotal: number;
    label: string;
  }[];
  reviewsDue: number;
}

interface HourlyEntry {
  hour: string;
  count: number;
}

function formatTimeUntil(nextReviewAt: string | null): string {
  if (!nextReviewAt) return "No reviews scheduled";

  const diffMs = new Date(nextReviewAt).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);

  if (minutes <= 0) return "Next reviews now";
  if (minutes < 60) return `Next reviews in ${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remMinutes = minutes % 60;
    return `Next reviews in ${hours}h${remMinutes > 0 ? ` ${remMinutes}m` : ""}`;
  }

  const days = Math.floor(hours / 24);
  return `Next reviews in ${days}d`;
}

export default function ReviewSchedule({
  nextReviewAt,
  schedule,
  reviewsDue,
}: ReviewScheduleProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [hourlyCache, setHourlyCache] = useState<Record<string, HourlyEntry[] | "loading">>({});

  const toggleDay = async (dateKey: string) => {
    if (expandedDay === dateKey) {
      setExpandedDay(null);
      return;
    }
    setExpandedDay(dateKey);

    if (hourlyCache[dateKey]) return; // already fetched — just re-expand from cache

    setHourlyCache((prev) => ({ ...prev, [dateKey]: "loading" }));
    try {
      const res = await apiFetch(`/api/stats/schedule/${dateKey}/hourly`);
      const data: HourlyEntry[] = res.ok ? await res.json() : [];
      setHourlyCache((prev) => ({ ...prev, [dateKey]: data }));
    } catch {
      setHourlyCache((prev) => ({ ...prev, [dateKey]: [] }));
    }
  };

  // Generate the 5-day list, with cumulative totals and bar widths scaled to the max.
  const generateDailyData = () => {
    if (!schedule || schedule.length === 0) return [];

    let currentTotal = reviewsDue;
    const tempDays = [];
    for (let i = 0; i < schedule.length; i++) {
      currentTotal += schedule[i].count;
      tempDays.push({
        date: schedule[i].date,
        day: schedule[i].label,
        added: schedule[i].count,
        total: currentTotal,
        isActive: schedule[i].count > 0,
      });
    }

    const maxCount = Math.max(...tempDays.map((d) => d.total), 1);

    return tempDays.map((day) => ({
      ...day,
      barWidth: `${(day.total / maxCount) * 100}%`,
    }));
  };

  const forecastData = generateDailyData();

  return (
    <div className="flex items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-lg">
        <div className="flex justify-center h-full">
          <div className="bg-shodo-paper text-shodo-ink font-sans w-full max-w-[480px] relative flex flex-col overflow-hidden rounded-2xl border-2 border-shodo-ink/10 shadow-sm h-full">
            <div className="flex flex-col grow pb-3">
              {/* Header Section */}
              <div className="bg-shodo-ink/5 flex items-center px-4 py-4 border-b border-shodo-ink/10">
                <div className="text-shodo-ink font-bold text-xl leading-none">
                  {formatTimeUntil(nextReviewAt)}
                </div>
              </div>

              {/* Daily Rows */}
              <div className="flex flex-col gap-1 px-2 pt-1">
                {forecastData.map((day) => {
                  const isExpanded = expandedDay === day.date;
                  const hourly = hourlyCache[day.date];
                  const dayStartOffset = day.total - day.added;
                  const hourlyMax = Array.isArray(hourly)
                    ? Math.max(...hourly.map((h) => h.count), 1)
                    : 1;
                  let cumulative = dayStartOffset;

                  return (
                    <div key={day.date}>
                      <div
                        onClick={() => day.isActive && toggleDay(day.date)}
                        className={`flex items-center gap-2 px-3 py-2 select-none rounded-md transition-colors duration-150 ${
                          day.isActive
                            ? "cursor-pointer hover:bg-shodo-ink/5"
                            : "cursor-default"
                        }`}
                      >
                        {/* Day Label */}
                        <div className="text-right shrink-0 w-[40px] text-sm font-medium text-shodo-ink/80">
                          {day.day}
                        </div>

                        {/* Progress Bar Container */}
                        <div className="flex grow justify-start items-center gap-1 h-full px-2">
                          <div className="w-full bg-shodo-ink/10 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${day.isActive ? "bg-shodo-accent" : "bg-transparent"}`}
                              style={{ width: day.barWidth }}
                            />
                          </div>
                        </div>

                        {/* Count Stats */}
                        <div className="text-shodo-ink/60 flex shrink-0 w-[70px] justify-end items-center text-sm font-bold whitespace-nowrap">
                          <span className="text-xs font-normal mr-1 text-shodo-ink/80">
                            (+{day.added})
                          </span>{" "}
                          {day.total}
                        </div>

                        {/* Drill-down chevron */}
                        <div className="shrink-0 w-4 flex justify-center">
                          {day.isActive && (
                            <ChevronRight
                              size={16}
                              className={`text-shodo-ink/40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                            />
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pl-12 pr-3 pb-2 flex flex-col gap-1">
                          {hourly === "loading" && (
                            <div className="text-xs text-shodo-ink/50 py-2">Loading…</div>
                          )}
                          {Array.isArray(hourly) && hourly.length === 0 && (
                            <div className="text-xs text-shodo-ink/50 py-2">No breakdown available</div>
                          )}
                          {Array.isArray(hourly) &&
                            hourly.map((h) => {
                              cumulative += h.count;
                              return (
                                <div key={h.hour} className="flex items-center gap-2 py-1">
                                  <div className="text-right shrink-0 w-[40px] text-xs font-medium text-shodo-ink/60">
                                    {h.hour}
                                  </div>
                                  <div className="flex grow justify-start items-center gap-1 h-full px-2">
                                    <div className="w-full bg-shodo-ink/10 rounded-full h-1.5 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-shodo-accent/70"
                                        style={{ width: `${(h.count / hourlyMax) * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="text-shodo-ink/50 flex shrink-0 w-[70px] justify-end items-center text-xs font-bold whitespace-nowrap">
                                    <span className="text-xs font-normal mr-1 text-shodo-ink/70">
                                      (+{h.count})
                                    </span>{" "}
                                    {cumulative}
                                  </div>
                                  <div className="shrink-0 w-4" />
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
