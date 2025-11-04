"use client";

import React, { useState, useEffect, useRef } from 'react'; // <-- Import useRef
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { KnowledgeUnit, FacetType, Lesson, VocabLesson, KanjiLesson } from '@/types';
import { db } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { KNOWLEDGE_UNITS_COLLECTION } from '@/lib/firebase-config';

export default function LearnItemPage() {
  const router = useRouter();
  const params = useParams();
  // TODO Seems to imply we don't know what we get passed in the URL params, please check
  const kuId = Array.isArray(params.kuId) ? params.kuId[0] : params.kuId;

  // --- FIX: Add useRef to prevent double-fetch in Strict Mode ---
  const fetchRef = useRef(false);
  // --- END FIX ---

  const [ku, setKu] = useState<KnowledgeUnit | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFacets, setSelectedFacets] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // --- FIX: Add gate to prevent double-fetch ---
    if (process.env.NODE_ENV === 'development' && fetchRef.current) {
      return; // Already fetched, do nothing on the second mount
    }
    // --- END FIX ---

    const fetchLesson = async () => {
      if (!kuId) return; // TODO is this part of normal flow? Maybe empty learning item queue?

      setIsLoading(true);
      setError(null);
      setKu(null);
      setLesson(null);

      try {
        // 1. Fetch the specific KU document
        const kuRef = doc(db, KNOWLEDGE_UNITS_COLLECTION, kuId);
        const kuDoc = await getDoc(kuRef);

        if (!kuDoc.exists()) {
          setError("Learning item not found.");
          return;
        }
        
        const kuData = { id: kuDoc.id, ...kuDoc.data() } as KnowledgeUnit;
        setKu(kuData);

        // 2. Fetch the Lesson for this kuDoc by kuDoc.id
        const lessonResponse = await fetch('/api/generate-lesson', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kuId: kuDoc.id }),
        });

        if (!lessonResponse.ok) {
          const err = await lessonResponse.json();
          throw new Error(err.error || "Failed to generate lesson");
        }

        const lessonData = await lessonResponse.json();
        setLesson(lessonData as Lesson); 
      } catch (err: any) {
        setError(err.message || "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (kuId) {
       fetchLesson();
       // --- FIX: Set ref to true after first fetch ---
       if (process.env.NODE_ENV === 'development') {
         fetchRef.current = true;
       }
       // --- END FIX ---
    } else {
        setIsLoading(false);
    }

  }, [kuId]);

  // --- Facet Selection Handlers (Unchanged) ---
  const handleCheckboxChange = (facetKey: string) => {
    setSelectedFacets((prev) => ({
      ...prev,
      [facetKey]: !prev[facetKey],
    }));
  };

  const handleSubmitFacets = async () => {
    if (!ku || !lesson) return;
    setIsSubmitting(true);
    setError(null); 

    const selectedFacetKeys = Object.keys(selectedFacets).filter(
      (key) => selectedFacets[key]
    );

    if (selectedFacetKeys.length === 0) {
      setError('Please select at least one facet to learn.');
      setIsSubmitting(false);
      return;
    }

    // --- New: Construct detailed payload ---
    const facetsToCreatePayload = selectedFacetKeys.map(key => {
      if (key.startsWith('Kanji-Component-') && lesson.type === 'Vocab') {
        const kanjiChar = key.split('-')[2];
        const kanjiData = (lesson as VocabLesson).component_kanji?.find(k => k.kanji === kanjiChar);
        return { 
          key: key, 
          data: {
            meaning: kanjiData?.meaning,
            onyomi: kanjiData?.onyomi,
            kunyomi: kanjiData?.kunyomi
          } 
        };
      }
      return { key: key };
    });
    // --- End New ---

    try {
      const response = await fetch('/api/review-facets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kuId: ku.id,
          facetsToCreate: facetsToCreatePayload, // Send new payload
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create facets');
      }

      // --- New: Dispatch event to refresh header stats ---
      window.dispatchEvent(new CustomEvent('refreshStats'));
      // --- End New ---

      router.push('/learn'); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Type-Aware Render Functions (With FULL dark mode classes) ---

  const renderVocabLesson = (lesson: VocabLesson) => (
    <>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Meaning</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">{lesson.meaning_explanation}</p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Reading</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">{lesson.reading_explanation}</p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Context Examples</h2>
        <ul className="space-y-4">
          {lesson.context_examples && lesson.context_examples.length > 0 ? (
            lesson.context_examples.map((ex, i) => (
              <li key={i} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-md">
                <p className="text-2xl text-gray-900 dark:text-white mb-1">{ex.sentence}</p>
                <p className="text-md text-gray-600 dark:text-gray-400">{ex.translation}</p>
              </li>
            ))
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">No context examples provided.</p>
          )}
        </ul>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Component Kanji</h2>
        <ul className="space-y-2">
          {lesson.component_kanji && lesson.component_kanji.length > 0 ? (
            lesson.component_kanji.map((k, i) => (
              <li key={`${k.kanji}-${i}`} className="flex items-center space-x-4 p-3 bg-gray-200 dark:bg-gray-700 rounded-md">
                <span className="text-3xl text-gray-900 dark:text-white">{k.kanji}</span>
                <div>
                  <p className="text-lg text-gray-700 dark:text-gray-300">{k.reading}</p>
                  <p className="text-md text-gray-600 dark:text-gray-400">{k.meaning}</p>
                </div>
              </li>
            ))
          ) : (
             <p className="text-gray-500 dark:text-gray-400 italic">No component kanji provided.</p>
          )}
        </ul>
      </div>
    </>
  );

  const renderKanjiLesson = (lesson: KanjiLesson) => (
    <>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Meaning</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300">{lesson.meaning}</p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Radicals</h2>
        <ul className="flex flex-wrap gap-4">
          {lesson.radicals && lesson.radicals.length > 0 ? (
            lesson.radicals.map((r, i) => (
              <li key={`${r.radical}-${i}`} className="p-4 bg-gray-200 dark:bg-gray-700 rounded-md text-center">
                <span className="text-3xl text-gray-900 dark:text-white">{r.radical}</span>
                <p className="text-md text-gray-600 dark:text-gray-400">{r.meaning}</p>
              </li>
            ))
          ) : (
            <p className="text-gray-500 dark:text-gray-400 italic">No radicals provided.</p>
          )}
        </ul>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Meaning Mnemonic</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 italic">{lesson.mnemonic_meaning}</p>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Readings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400 mb-2">On'yomi (Katakana)</h3>
            <ul className="space-y-2">
              {lesson.reading_onyomi && lesson.reading_onyomi.length > 0 ? (
                lesson.reading_onyomi.map((r, i) => (
                  <li key={`${r.reading}-${i}`} className="p-3 bg-gray-200 dark:bg-gray-700 rounded-md">
                    <span className="text-2xl text-gray-900 dark:text-white">{r.reading}</span>
                    <p className="text-md text-gray-600 dark:text-gray-400">e.g., {r.example}</p>
                  </li>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">No on'yomi provided.</p>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-500 dark:text-gray-400 mb-2">Kun'yomi (Hiragana)</h3>
            <ul className="space-y-2">
              {lesson.reading_kunyomi && lesson.reading_kunyomi.length > 0 ? (
                lesson.reading_kunyomi.map((r, i) => (
                  <li key={`${r.reading}-${i}`} className="p-3 bg-gray-200 dark:bg-gray-700 rounded-md">
                    <span className="text-2xl text-gray-900 dark:text-white">{r.reading}</span>
                    <p className="text-md text-gray-600 dark:text-gray-400">e.g., {r.example}</p>
                  </li>
                ))
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">No kun'yomi provided.</p>
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Reading Mnemonic</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 italic">{lesson.mnemonic_reading}</p>
      </div>
    </>
  );

  const renderFacetChecklist = () => (
    <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Choose What to Learn</h2>
      <div className="space-y-4">

        {lesson?.type === 'Vocab' && (
          <>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Definition']}
                onChange={() => handleCheckboxChange('Content-to-Definition')}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">Meaning</span>
            </label>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Reading']}
                onChange={() => handleCheckboxChange('Content-to-Reading')}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">Reading</span>
            </label>

            {/* --- REFACTOR: Single Component Kanji Checkbox --- */}
            {lesson.component_kanji && lesson.component_kanji.map((kanji, index) => (
              <div key={`${kanji.kanji}-${index}`} className="p-4 bg-gray-300 dark:bg-gray-800 rounded-md">
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Component Kanji</h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3">
                  The kanji is <span className="font-bold text-lg">{kanji.kanji}</span>, which generally means "{kanji.meaning}".
                  It has the readings:
                </p>
                <div className="ml-4 mb-3 text-gray-600 dark:text-gray-400">
                  {kanji.kunyomi && kanji.kunyomi.length > 0 && (
                    <p>kun'yomi: {kanji.kunyomi.join(', ')}</p>
                  )}
                  {kanji.onyomi && kanji.onyomi.length > 0 && (
                    <p>on'yomi: {kanji.onyomi.join(', ')}</p>
                  )}
                </div>
                <label className="flex items-center p-2 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 cursor-pointer">
                  <input type="checkbox" className="h-5 w-5 rounded bg-gray-400 dark:bg-gray-900 border-gray-500 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={!!selectedFacets[`Kanji-Component-${kanji.kanji}`]}
                    onChange={() => handleCheckboxChange(`Kanji-Component-${kanji.kanji}`)}
                  />
                  <span className="ml-3 text-lg text-gray-900 dark:text-white">Add {kanji.kanji}</span>
                </label>
              </div>
            ))}
            {/* --- END REFACTOR --- */}
          </>
        )}

        {lesson?.type === 'Kanji' && (
          <>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Definition']}
                onChange={() => handleCheckboxChange('Content-to-Definition')}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">Meaning (Kanji {'->'} Meaning)</span>
            </label>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Reading']}
                onChange={() => handleCheckboxChange('Content-to-Reading')}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">Reading (Kanji {'->'} On/Kun)</span>
            </label>
          </>
        )}

        <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
          <input type="checkbox" className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            checked={!!selectedFacets['AI-Generated-Question']}
            onChange={() => handleCheckboxChange('AI-Generated-Question')}
          />
          <span className="ml-3 text-lg text-gray-900 dark:text-white">AI-Generated Quiz Questions</span>
        </label>

      </div>

      <button
        onClick={handleSubmitFacets}
        disabled={isSubmitting || !lesson}
        className="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-wait"
      >
        {isSubmitting ? 'Saving...' : 'Start Learning Selected Facets'}
      </button>
    </div>
  );


  // Used to determine if the call to this page came from the review facet
  const searchParams = useSearchParams();
  const source = searchParams.get('source');

  // --- Main Render ---
  return (
    <>
      {/* --- DEBUGGING LOG --- */}
      {console.log('[Render Debug]', { 
        isLoading, 
        hasError: !!error, 
        lessonType: lesson?.type,
        hasLesson: !!lesson,
        source: source
      })}
    <main className="container mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-2 break-all">
          {isLoading ? '...'
           : lesson?.type === 'Kanji' && (lesson as KanjiLesson).kanji ? (lesson as KanjiLesson).kanji 
           : ku?.content || '...' 
          }
        </h1>
        <p className="text-2xl text-gray-500 dark:text-gray-400 capitalize">
          {ku ? ku.type : '...'}
        </p>
      </header>

      {isLoading && <p className="text-xl text-center text-gray-500 dark:text-gray-400">Loading lesson...</p>}
      {error && <div className="bg-red-200 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-800 dark:text-red-100 p-4 rounded-md mb-6">{error}</div>}
      
      {lesson && ku?.type === 'Vocab' && renderVocabLesson(lesson as VocabLesson)}
      {lesson && ku?.type === 'Kanji' && renderKanjiLesson(lesson as KanjiLesson)}

      {!isLoading && !error && lesson && source !== 'review' && (
          <>
              {/* {console.log("Render conditions met, lesson object:", lesson)} */}
              {renderFacetChecklist()}
          </>
      )}

    </main>
    </>
  );
}
