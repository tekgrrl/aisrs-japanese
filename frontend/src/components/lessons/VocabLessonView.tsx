import React from "react";
import { VocabLesson } from "@/types";
import { FuriganaText } from "@/components/FuriganaText";
import RevealableText from "@/components/RevealableText";
import EditableSection from "./EditableSection";

interface VocabLessonViewProps {
  lesson: VocabLesson;
  onSaveSection?: (sectionKey: string, newContent: string) => Promise<void>;
  readOnly?: boolean;
  hideContext?: boolean;
  hideComponentKanji?: boolean;
}

export default function VocabLessonView({ 
  lesson, 
  onSaveSection, 
  readOnly = false,
  hideContext = false,
  hideComponentKanji = false
}: VocabLessonViewProps) {
  return (
    <>
      {/* --- Meaning Section --- */}
      <EditableSection
        title="Meaning"
        content={lesson.meaning_explanation}
        sectionKey="meaning_explanation"
        onSave={onSaveSection}
        readOnly={readOnly}
      />
      
      {/* Definitions Section */}
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Definitions
        </h2>
        <ul className="list-disc list-inside space-y-2">
            {(lesson.definitions || (lesson.definition ? [lesson.definition] : [])).map((def, i) => (
                <li key={i} className="text-lg text-gray-700 dark:text-gray-300">
                    {def}
                </li>
            ))}
            {(!lesson.definitions || lesson.definitions.length === 0) && !lesson.definition && (
                <p className="text-gray-500 dark:text-gray-400 italic">No definitions available.</p>
            )}
        </ul>
      </div>

      {/* --- Reading Section --- */}
      <EditableSection
        title="Reading"
        content={lesson.reading_explanation}
        sectionKey="reading_explanation"
        onSave={onSaveSection}
        readOnly={readOnly}
      />

      {/* --- Context Examples --- */}
      {!hideContext && (
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Context Examples
          </h2>
          <ul className="space-y-4">
            {lesson.context_examples && lesson.context_examples.length > 0 ? (
              lesson.context_examples.map((ex, i) => (
                <li key={i} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-md">
                  {/* Japanese Sentence with Furigana */}
                  <p className="text-2xl text-gray-900 dark:text-white mb-2">
                    <FuriganaText text={ex.sentence} />
                  </p>
                  
                  {/* English Translation (Revealable) */}
                  <p className="text-md leading-relaxed">
                    <RevealableText text={ex.translation} />
                  </p>
                </li>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">
                No context examples provided.
              </p>
            )}
          </ul>
        </div>
      )}

      {/* --- Component Kanji --- */}
      {!hideComponentKanji && (
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
            Component Kanji
          </h2>
          <ul className="space-y-2">
            {lesson.component_kanji && lesson.component_kanji.length > 0 ? (
              lesson.component_kanji.map((k, i) => (
                <li
                  key={`${k.kanji}-${i}`}
                  className="flex items-center space-x-4 p-3 bg-gray-200 dark:bg-gray-700 rounded-md"
                >
                  <span className="text-3xl text-gray-900 dark:text-white">
                    {k.kanji}
                  </span>
                  <div>
                    <p className="text-lg text-gray-700 dark:text-gray-300">
                      {k.reading}
                    </p>
                    <p className="text-md text-gray-600 dark:text-gray-400">
                      {k.meaning}
                    </p>
                  </div>
                </li>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 italic">
                No component kanji provided.
              </p>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
