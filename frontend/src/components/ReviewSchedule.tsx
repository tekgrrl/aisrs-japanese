import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ReviewScheduleProps {
  next24HoursCount: number;
  schedule: {
    date: string;
    isToday: boolean;
    count: number;
    runningTotal: number;
    label: string;
  }[];
  reviewForecast?: Record<string, number>;
  reviewsDue: number;
}

export default function ReviewSchedule({ next24HoursCount, schedule, reviewForecast = {}, reviewsDue }: ReviewScheduleProps) {

  console.log(`schedule: ${JSON.stringify(schedule)}`);

  // 2. Generate Next 5 Days Data
  const generateDailyData = () => {
    const days = [];
    const now = new Date();
    // Start from tomorrow for the list? Or today? 
    // Usually "Upcoming" implies future days. Let's show next 5 days including today if relevant, 
    // or just next 5 days. WaniKani usually shows "Next 24h" then a breakdown.
    // Let's do next 5 days starting from today.

    let cumulativeTotal = reviewsDue;
    
    let maxCount = 0;

    if (!schedule || schedule.length === 0) {
      return [];
    }
    
    // ... logic that assumes schedule has content ...
    // Actually, looking at the code, the loop builds `days` array using `now` and `reviewForecast` BUT tries to READ from `schedule` at index `i`.
    // The previous version CALCULATED the schedule. The NEW version expects it passed in. 
    // If the valid data isn't ready, we should arguably return empty or loading.
    
    // First pass to calculate cumulative totals and find maxCount
    const tempDays = [];
    let currentTotal = reviewsDue;
    
    for (let i = 0; i < 5; i++) {
      currentTotal += schedule[i].count;
      tempDays.push({
        day: schedule[i].label,
        added: schedule[i].count,
        total: currentTotal,
        isActive: schedule[i].count > 0
      });
    }

    // Find max value for scaling (using total since that's what the bar likely usually represents in this context, 
    // or if it represents added, use added. User implementation uses 'total' in the previous map, so let's stick to total for scaling logic 
    // or arguably added if it's a diff chart. But user text says "(+N) Total". Let's assume bar is total backlog size.
    // Actually, typically forecast bars show the *added* amount per day. 
    // But WaniKani's forecast graph usually shows the backlog *accumulating*.
    // Let's use the maximum total to scale the bars.
    
    // Actually, looking at the previous user code `(day.total / maxCount)`, it seems they want the bar to represent the total.
    maxCount = Math.max(...tempDays.map(d => d.total), 1); // Avoid div by zero

    days.push(...tempDays);

    // Calculate bar widths relative to maxCount
    return days.map(day => ({
      ...day,
      barWidth: maxCount > 0 ? `${(day.total / maxCount) * 100}%` : '0%'
    }));
  };

  const forecastData = generateDailyData();

  return (
    <div className="flex items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-lg">
        <div className="flex justify-center h-full">
          <div className="bg-white text-[#333333] font-sans w-full max-w-[480px] relative flex flex-col overflow-hidden rounded-2xl border border-[#cad0d6] shadow-sm h-full">
            <div className="flex flex-col grow pb-3">
              
              {/* Header Section */}
              <div className="bg-[#d2e8ff] flex flex-wrap items-center gap-3 mb-3 px-4 py-4 border-b border-[#cad0d6]">
                <div className="text-[#6b7079] flex flex-col grow shrink-0 items-start gap-1">
                  <div className="text-sm font-medium uppercase tracking-wide">Next 24 Hours</div>
                  <div className="text-[#333333] font-bold text-[24px] leading-none">
                    {next24HoursCount === 0 ? 'No Reviews' : `${next24HoursCount} Reviews`}
                  </div>
                </div>
                <div className="flex shrink-0 basis-[100px] justify-center">
                  <img 
                    src="/chibi-meditates.png" 
                    alt="Forecast illustration" 
                    className="w-full max-w-[100px] object-contain" 
                  />
                </div>
              </div>

              {/* Daily Rows */}
              <div className="flex flex-col gap-1 px-2">
                {forecastData.map((day, index) => (
                  <div 
                    key={index}
                    className={`flex items-center gap-2 px-3 py-2 select-none rounded-md transition-colors duration-150 ${
                      day.isActive ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'
                    }`}
                  >
                    {/* Day Label */}
                    <div className="text-right shrink-0 w-[40px] text-sm font-medium text-[#999999]">
                      {day.day}
                    </div>

                    {/* Progress Bar Container */}
                    <div className="flex grow justify-start items-center gap-1 h-full px-2">
                      <div className="w-full bg-[#f4f4f4] rounded-full h-2 overflow-hidden">
                         <div 
                          className={`h-full rounded-full ${day.isActive ? 'bg-[#88cc00]' : 'bg-transparent'}`}
                          style={{ width: day.barWidth }}
                        />
                      </div>
                    </div>

                    {/* Count Stats - Increased width for (+N) Total format */}
                    <div className="text-[#6b7079] flex shrink-0 w-[70px] justify-end items-center text-sm font-bold whitespace-nowrap">
                      <span className="text-xs font-normal mr-1 text-gray-400">(+{day.added})</span> {day.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}