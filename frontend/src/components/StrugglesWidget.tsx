import React from "react";
import Link from "next/link";

interface StruggleItem {
  content: string;
  facetTypes: string[];
}

interface StrugglesWidgetProps {
  leechVocab?: StruggleItem[];
  weakGrammarPoints?: StruggleItem[];
}

export default function StrugglesWidget({
  leechVocab = [],
  weakGrammarPoints = [],
}: StrugglesWidgetProps) {
  if (leechVocab.length === 0 && weakGrammarPoints.length === 0) {
    return null; // Don't show the widget if there are no struggles
  }

  return (
    <div className="flex flex-col items-center justify-center p-4 font-sans h-full">
      <div className="w-full max-w-lg md:max-w-none">
        <div className="flex flex-col rounded-2xl border-2 border-shodo-persimmon/30 bg-shodo-paper p-6 overflow-hidden transition-all duration-200">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-shodo-persimmon/10">
              <span className="text-xl">⚠️</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-shodo-ink">Current Struggles</h2>
              <p className="text-sm text-shodo-ink-light">Items that need more attention</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Leech Vocab */}
            {leechVocab.length > 0 && (
              <div className="flex flex-col">
                <h3 className="text-md font-semibold text-shodo-ink mb-2 border-b border-shodo-ink/10 pb-1">
                  Vocabulary
                </h3>
                <div className="flex flex-wrap gap-2">
                  {leechVocab.map((item, idx) => (
                    <div
                      key={idx}
                      className="inline-flex flex-col items-center justify-center rounded-md border border-shodo-persimmon/40 bg-shodo-paper-dark px-3 py-1 text-sm text-shodo-ink"
                      title={item.facetTypes.join(", ")}
                    >
                      <span className="font-medium">{item.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weak Grammar Points */}
            {weakGrammarPoints.length > 0 && (
              <div className="flex flex-col">
                <h3 className="text-md font-semibold text-shodo-ink mb-2 border-b border-shodo-ink/10 pb-1">
                  Grammar
                </h3>
                <div className="flex flex-wrap gap-2">
                  {weakGrammarPoints.map((item, idx) => (
                    <div
                      key={idx}
                      className="inline-flex flex-col items-center justify-center rounded-md border border-shodo-persimmon/40 bg-shodo-paper-dark px-3 py-1 text-sm text-shodo-ink"
                      title={item.facetTypes.join(", ")}
                    >
                      <span className="font-medium">{item.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
