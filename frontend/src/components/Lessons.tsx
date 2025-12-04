import React from 'react';
import { Check } from 'lucide-react';
import Link from 'next/link';

interface LessonsProps {
  lessonCount?: number;
}

export default function Lessons({ lessonCount = 0 }: LessonsProps) {
  const hasLessons = lessonCount > 0;

  return (
    <div className="flex items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-lg">
        <div className="flex justify-center">
          <Link href="/learn" className="group relative flex w-full max-w-[480px] cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#cad0d6] bg-[#e8ecf0] p-4 transition-all duration-200 hover:border-[#9ea5ac] hover:shadow-md active:scale-[0.99] active:border-[#cad0d6] active:shadow-sm">
            <div className="flex flex-wrap items-center justify-center gap-4 sm:flex-nowrap">
              
              {/* Image Container */}
              <div className="flex shrink-0 basis-[140px] items-center justify-center">
                <div className="relative flex w-full max-w-[140px] items-center justify-center">
                  <img 
                    src="/shodo.png" 
                    alt="Completed Crabigator" 
                    className="aspect-square w-full object-contain transition-transform duration-300 group-hover:scale-105" 
                  />
                </div>
              </div>

              {/* Content Container */}
              <div className="flex grow flex-col gap-2 text-center sm:text-left">
                <div>
                  <div className="text-base leading-[1.4] text-[#333333]">Today's</div>
                  <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
                    <div className="text-[24px] font-bold leading-none text-[#333333]">Lessons</div>
                    <div>
                      {!hasLessons ? (
                        <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full border border-[#cad0d6] bg-[#f4f4f4] px-2.5 text-xs font-semibold text-[#6b7079] transition-colors group-hover:bg-white group-hover:text-[#333333]">
                          <span className="flex items-center gap-1">
                            Done!
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-full border border-[#cad0d6] bg-[#f4f4f4] px-2.5 text-xs font-semibold text-[#6b7079] transition-colors group-hover:bg-white group-hover:text-[#333333]">
                          {lessonCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-sm leading-[1.6] text-[#6b7079]">
                  <p className="m-0">
                    {!hasLessons ? (
                      <>All done. Do your <span className="font-medium text-[#333333] decoration-dotted hover:underline">Reviews</span> to advance your learning.</>
                    ) : (
                      <>You have {lessonCount} new lessons available.</>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}