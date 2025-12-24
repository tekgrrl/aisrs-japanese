import React from "react";
import { KanjiLesson } from "@/types";

interface KanjiLessonViewProps {
  lesson: KanjiLesson;
}

export default function KanjiLessonView({ lesson }: KanjiLessonViewProps) {
  return (
    <>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Meaning
        </h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">
          {lesson.meaning}
        </p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Radicals
        </h2>
        <ul className="flex flex-wrap gap-4">
          {lesson.radical ? (
            <li
              className="p-4 bg-gray-200 dark:bg-gray-700 rounded-md text-center"
            >
              <span className="text-3xl text-gray-900 dark:text-white">
                {lesson.radical.character}
              </span>
              <p className="text-md text-gray-600 dark:text-gray-400">
                {lesson.radical.meaning}
              </p>
            </li>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">
              No radical provided.
            </p>
          )}
        </ul>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Meaning Mnemonic
        </h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 italic">
          {lesson.personalMnemonic || lesson.mnemonic_meaning}
        </p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Readings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400 mb-2">
              On'yomi (Katakana)
            </h3>
            <ul className="space-y-2">
              {lesson.onyomi && lesson.onyomi.length > 0 ? (
                lesson.onyomi.map((r, i) => (
                  <li
                    key={`${r}-${i}`}
                    className="p-3 bg-gray-200 dark:bg-gray-700 rounded-md"
                  >
                    <span className="text-2xl text-gray-900 dark:text-white">
                      {r}
                    </span>
                  </li>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">
                  No on'yomi provided.
                </p>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400 mb-2">
              Kun'yomi (Hiragana)
            </h3>
            <ul className="space-y-2">
              {lesson.kunyomi && lesson.kunyomi.length > 0 ? (
                lesson.kunyomi.map((r, i) => (
                  <li
                    key={`${r}-${i}`}
                    className="p-3 bg-gray-200 dark:bg-gray-700 rounded-md"
                  >
                    <span className="text-2xl text-gray-900 dark:text-white">
                      {r}
                    </span>
                  </li>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">
                  No kun'yomi provided.
                </p>
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8 border border-shodo-ink/5">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Reading Mnemonic
        </h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 italic">
          {lesson.personalMnemonic || lesson.mnemonic_reading}
        </p>
      </div>
    </>
  );
}
