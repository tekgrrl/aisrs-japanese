import React from 'react';
import { ChevronRight } from 'lucide-react';

interface ReviewScheduleProps {
  hourlyForecast?: Record<string, number>;
  reviewForecast?: Record<string, number>;
  reviewsDue: number;
}

export default function ReviewSchedule({ hourlyForecast = {}, reviewForecast = {}, reviewsDue }: ReviewScheduleProps) {
  // 1. Calculate Next 24 Hours Count
  const calculateNext24Hours = () => {
    const now = new Date();
    let count = 0;
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getTime() + i * 60 * 60 * 1000);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}-${hh}`;
      count += hourlyForecast[key] || 0;
    }
    return count;
  };

  const next24HoursCount = calculateNext24Hours();

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

    for (let i = 0; i < 5; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = `${yyyy}-${mm}-${dd}`;
      
      const count = reviewForecast[key] || 0;
      if (count > maxCount) maxCount = count;

      const addedToday = reviewForecast[key] || 0;
      cumulativeTotal += addedToday;

      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      
      days.push({
        day: dayName,
        added: addedToday,
        total: cumulativeTotal,
        isActive: addedToday > 0
      });
    }

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

                    {/* Count Stats */}
                    <div className="text-[#6b7079] flex shrink-0 w-[40px] justify-end items-center text-sm font-bold">
                      {day.total}
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