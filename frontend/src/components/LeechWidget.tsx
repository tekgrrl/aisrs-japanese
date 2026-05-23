import React from "react";
import { IconKasure } from "./ShodoIcons";

export interface LeechItem {
  content: string;
  type: "vocab" | "grammar";
  facetTypes?: string[];
}

interface LeechWidgetProps {
  leechItems?: LeechItem[];
}

const facetLabelMap: Record<string, string> = {
  "Content-to-Definition": "Meaning",
  "Definition-to-Content": "Recall",
  "Content-to-Reading": "Reading",
  "Reading-to-Content": "Reading Recall",
  "Kanji-Component-Meaning": "Component Meaning",
  "Kanji-Component-Reading": "Component Reading",
  "audio": "Audio",
  "sentence-assembly": "Assembly",
  "sentence-cloze": "Cloze",
};

export default function LeechWidget({ leechItems = [] }: LeechWidgetProps) {
  return (
    <div className="w-full h-full p-4 font-sans">
      <div className="h-full rounded-2xl border-2 border-shodo-ink/10 bg-shodo-paper p-6 transition-all duration-200 hover:border-shodo-persimmon/30 hover:shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-shodo-ink/10">
          <div className="flex items-center gap-3">
            <IconKasure className="w-8 h-8 text-shodo-persimmon shrink-0" />
            <div>
              <h2 className="text-xl font-bold text-shodo-ink leading-tight">
                Struggling Items
              </h2>
              <p className="text-xs text-shodo-ink-light mt-0.5">
                Review these focus points to maintain your learning flow.
              </p>
            </div>
          </div>
          {leechItems.length > 0 && (
            <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-shodo-persimmon px-2.5 text-xs font-bold text-shodo-paper shadow-sm">
              {leechItems.length}
            </span>
          )}
        </div>

        {/* Content Area */}
        {leechItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-shodo-matcha/10 flex items-center justify-center text-shodo-matcha mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-shodo-ink">
              All Brush Strokes Fluid
            </h3>
            <p className="text-xs text-shodo-ink-light max-w-xs mt-1 leading-relaxed">
              No critical leeches or weak grammar points detected. You are in a state of flow!
            </p>
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
            {leechItems.map((item, idx) => (
              <div
                key={`${item.type}-${item.content}-${idx}`}
                className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-shodo-ink/5 bg-shodo-paper-dark/30 hover:bg-shodo-paper-dark/60 transition-colors"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Badge: Type */}
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        item.type === "grammar"
                          ? "bg-shodo-indigo/10 text-shodo-indigo"
                          : "bg-shodo-stamp-red/10 text-shodo-stamp-red"
                      }`}
                    >
                      {item.type}
                    </span>
                    {/* Facet badges */}
                    {item.facetTypes && item.facetTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {item.facetTypes.map((facet) => (
                          <span
                            key={facet}
                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-shodo-ink/5 text-shodo-ink-light text-[9px] font-medium"
                          >
                            {facetLabelMap[facet] || facet}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Japanese Content */}
                  <div className="text-lg font-bold text-shodo-ink tracking-wide truncate">
                    {item.content}
                  </div>
                </div>

                {/* Focus/Action Indicator */}
                <div className="shrink-0 flex items-center justify-center self-center w-7 h-7 rounded-lg text-shodo-persimmon hover:bg-shodo-persimmon/10 transition-colors">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
