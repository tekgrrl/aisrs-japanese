"use client";

import React from "react";

// See aigenki-grammar-notation-spec.md for the {Token} notation this parses.
export type PatternSegment =
  | { type: "text"; value: string }
  | { type: "token"; value: string };

interface PillStyle {
  label: string;
  className: string;
}

// One entry per distinct token the corpus uses today; multiple keys can point to the
// same style object where the spec's own naming is still unresolved (§8: Group/Target
// vs. Category/Item) — whichever spelling a KU ends up using, it renders correctly.
// Colors are picked per named role, not by bare word-class, so two same-class slots in
// one pattern (e.g. N_group + N_target) stay visually distinct; reused across KUs only
// where the reference corpus (§7) shows the tokens never co-occur in the same pattern.
export const PILL_TOKEN_MAP: Record<string, PillStyle> = (() => {
  const category: PillStyle = { label: "Category", className: "bg-blue-100 text-blue-700" };
  const item: PillStyle = { label: "Item", className: "bg-pink-100 text-pink-700" };
  const adjective: PillStyle = { label: "Adjective", className: "bg-amber-100 text-amber-800" };
  const adjForm = (label: string): PillStyle => ({ label, className: "bg-amber-100 text-amber-800" });
  const adjI = adjForm("い-Adjective");
  const adjIStem = adjForm("い-Adjective stem");
  const adjNa = adjForm("な-Adjective");
  const verbForm = (label: string): PillStyle => ({ label, className: "bg-green-100 text-green-700" });
  const verbDict = verbForm("Verb (dictionary form)");
  const verbMasu = verbForm("Verb, ます-form stem");
  const verbTe = verbForm("Verb, て-form");
  const verbNai = verbForm("Verb, ない-form");
  const verbTa = verbForm("Verb, た-form");
  const verbBa = verbForm("Verb, ば-form");
  const noun: PillStyle = { label: "Noun", className: "bg-blue-100 text-blue-700" };
  const place: PillStyle = { label: "Place", className: "bg-blue-100 text-blue-700" };
  const itemA: PillStyle = { label: "Item A", className: "bg-blue-100 text-blue-700" };
  const itemB: PillStyle = { label: "Item B", className: "bg-pink-100 text-pink-700" };
  const clause: PillStyle = { label: "Clause", className: "bg-indigo-100 text-indigo-700" };
  const clauseA: PillStyle = { label: "Clause A", className: "bg-indigo-100 text-indigo-700" };
  const clauseB: PillStyle = { label: "Clause B", className: "bg-purple-100 text-purple-700" };

  return {
    // Nouns — role-named (both spellings from the open naming question map to the same style)
    N_group: category,
    N_category: category,
    N_target: item,
    N_item: item,
    N_A: itemA,
    N_B: itemB,
    "N-place": place,
    // Nouns — bare, single-slot patterns only
    N: noun,
    // Verbs — bare word-class only; no role subscripts exist in the corpus yet.
    // Each conjugated form gets its own label — "Verb" alone doesn't tell a learner
    // which form the pattern actually expects.
    "V-dict": verbDict,
    "V-masu": verbMasu,
    "V-te": verbTe,
    "V-nai": verbNai,
    "V-ta": verbTa,
    "V-ba": verbBa,
    // Adjectives — bare {Adj} stays generic (spec §7 uses it for patterns where either
    // adjective type is valid); the typed forms get their own label like verb forms do.
    Adj: adjective,
    "Adj-i": adjI,
    "Adj-i·stem": adjIStem,
    "Adj-na": adjNa,
    // Clauses
    Cl: clause,
    CL_A: clauseA,
    CL_B: clauseB,
  };
})();

export type PillToken = keyof typeof PILL_TOKEN_MAP;

const UNMAPPED_PILL_CLASSNAME = "bg-gray-100 text-gray-500";

function parsePattern(pattern: string): PatternSegment[] {
  const segments: PatternSegment[] = [];
  const regex = /\{([^}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(pattern)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: pattern.slice(lastIndex, match.index) });
    }
    segments.push({ type: "token", value: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < pattern.length) {
    segments.push({ type: "text", value: pattern.slice(lastIndex) });
  }
  return segments;
}

// Groups each token with the literal text immediately following it (e.g. a pill plus the
// particle right after it, の中で) into one unit, rendered as a single non-wrapping span —
// otherwise a line break can land between a pill and the text right after it, stranding a
// character or two on the next line instead of wrapping the whole chunk together. Safe to
// keep short: per the notation spec, text between tokens is always a brief connector/particle,
// never a full clause (clause content is itself a {Cl} token).
function groupSegments(segments: PatternSegment[]): PatternSegment[][] {
  const groups: PatternSegment[][] = [];
  let current: PatternSegment[] = [];
  for (const segment of segments) {
    if (segment.type === "token" && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(segment);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

interface GrammarPatternDisplayProps {
  pattern: string;
  className?: string;
}

/**
 * Renders a Grammar KU's pattern string. If it uses the {Token} notation from
 * aigenki-grammar-notation-spec.md, each token renders as a colored pill; otherwise
 * (old [Bracket] style, or a KU not yet curated into the new notation) it renders
 * exactly as plain text, unchanged.
 */
export default function GrammarPatternDisplay({ pattern, className }: GrammarPatternDisplayProps) {
  const usesNotation = /\{[^}]+\}/.test(pattern);
  if (!usesNotation) {
    return <div className={className}>{pattern}</div>;
  }

  const groups = groupSegments(parsePattern(pattern));
  return (
    <div className={className}>
      {groups.map((group, gi) => (
        <span key={gi} className="inline-block whitespace-nowrap">
          {group.map((segment, i) => {
            if (segment.type === "text") {
              return <React.Fragment key={i}>{segment.value}</React.Fragment>;
            }
            const style = PILL_TOKEN_MAP[segment.value];
            return (
              <span
                key={i}
                className={`inline-block mx-1.5 px-5 py-2 rounded-full text-2xl align-middle font-bold ${style?.className ?? UNMAPPED_PILL_CLASSNAME}`}
              >
                {style?.label ?? segment.value}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
}
