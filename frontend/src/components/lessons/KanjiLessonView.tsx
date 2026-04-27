import React from "react";
import { KanjiLesson } from "@/types";

interface KanjiLessonViewProps {
  lesson: KanjiLesson;
}

export default function KanjiLessonView({ lesson }: KanjiLessonViewProps) {
  return (
    <>
      <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 border border-shodo-ink/10">
        <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
          Meaning
        </h2>
        <p className="text-lg text-shodo-ink-light">
          {lesson.meaning}
        </p>
      </div>
      <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 border border-shodo-ink/10">
        <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
          Radicals
        </h2>
        <ul className="flex flex-wrap gap-4">
          {lesson.radical ? (
            <li className="p-4 bg-shodo-paper-warm rounded-md text-center">
              <span className="text-3xl text-shodo-ink">
                {lesson.radical.character}
              </span>
              <p className="text-md text-shodo-ink-light">
                {lesson.radical.meaning}
              </p>
            </li>
          ) : (
            <p className="text-shodo-ink-faint italic">
              No radical provided.
            </p>
          )}
        </ul>
      </div>
      <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 border border-shodo-ink/10">
        <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
          Meaning Mnemonic
        </h2>
        <p className="text-lg text-shodo-ink-light italic">
          {lesson.personalMnemonic || lesson.mnemonic_meaning}
        </p>
      </div>
      <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 border border-shodo-ink/10">
        <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
          Readings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xl font-semibold text-shodo-ink-faint mb-2">
              On'yomi (Katakana)
            </h3>
            <ul className="space-y-2">
              {lesson.onyomi && lesson.onyomi.length > 0 ? (
                lesson.onyomi.map((r, i) => (
                  <li
                    key={`${r}-${i}`}
                    className="p-3 bg-shodo-paper-warm rounded-md"
                  >
                    <span className="text-2xl text-shodo-ink">
                      {r}
                    </span>
                  </li>
                ))
              ) : (
                <p className="text-shodo-ink-faint italic">
                  No on'yomi provided.
                </p>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-shodo-ink-faint mb-2">
              Kun'yomi (Hiragana)
            </h3>
            <ul className="space-y-2">
              {lesson.kunyomi && lesson.kunyomi.length > 0 ? (
                lesson.kunyomi.map((r, i) => (
                  <li
                    key={`${r}-${i}`}
                    className="p-3 bg-shodo-paper-warm rounded-md"
                  >
                    <span className="text-2xl text-shodo-ink">
                      {r}
                    </span>
                  </li>
                ))
              ) : (
                <p className="text-shodo-ink-faint italic">
                  No kun'yomi provided.
                </p>
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-shodo-paper-dark p-6 rounded-lg shadow-sm mb-8 border border-shodo-ink/10">
        <h2 className="text-2xl font-semibold mb-4 text-shodo-ink">
          Reading Mnemonic
        </h2>
        <p className="text-lg text-shodo-ink-light italic">
          {lesson.personalMnemonic || lesson.mnemonic_reading}
        </p>
      </div>
    </>
  );
}
