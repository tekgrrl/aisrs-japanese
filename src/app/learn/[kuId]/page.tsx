"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { KnowledgeUnit, FacetType, Lesson, VocabLesson, KanjiLesson } from '@/types';
import { db } from '@/lib/firebase-client';
import { doc, getDoc } from 'firebase/firestore';
import { KNOWLEDGE_UNITS_COLLECTION } from '@/lib/firebase-config';
// import { logger } from '@/lib/logger'; // Client-side logging needs setup


export default function LearnItemPage() {
  const router = useRouter();
  const params = useParams();
  const kuId = Array.isArray(params.kuId) ? params.kuId[0] : params.kuId;

  const [ku, setKu] = useState<KnowledgeUnit | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFacets, setSelectedFacets] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchLesson = async () => {
      if (!kuId) return;

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

        // 2. Fetch the AI-generated Lesson
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

        console.log("Received lesson data:", lessonData);
        
        setLesson(lessonData as Lesson); // Cast as our new union type
      } catch (err: any) {
        setError(err.message || "An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    if (kuId) {
      fetchLesson();
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
    if (!ku) return;
    setIsSubmitting(true);
    
    const selectedFacetKeys = Object.keys(selectedFacets).filter(
      (key) => selectedFacets[key]
    );

    if (selectedFacetKeys.length === 0) {
      setError('Please select at least one facet to learn.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/review-facets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kuId: ku.id,
          facetsToCreate: selectedFacetKeys,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create facets');
      }

      router.push('/'); // Route to Manage page on success
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Type-Aware Render Functions (Now with safety checks) ---

  const renderVocabLesson = (lesson: VocabLesson) => (
    <>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Meaning</h2>
        <p className="text-lg text-gray-300">{lesson.meaning_explanation}</p>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Reading</h2>
        <p className="text-lg text-gray-300">{lesson.reading_explanation}</p>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Context Examples</h2>
        <ul className="space-y-4">
          {/* --- FIX: Add safety check --- */}
          {lesson.context_examples && lesson.context_examples.length > 0 ? (
            lesson.context_examples.map((ex, i) => (
              <li key={i} className="p-4 bg-gray-700 rounded-md">
                <p className="text-2xl text-white mb-1">{ex.sentence}</p>
                <p className="text-md text-gray-400">{ex.translation}</p>
              </li>
            ))
          ) : (
            <p className="text-gray-400 italic">No context examples provided.</p>
          )}
        </ul>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Component Kanji</h2>
        <ul className="space-y-2">
          {/* --- FIX: Add safety check --- */}
          {lesson.component_kanji && lesson.component_kanji.length > 0 ? (
            lesson.component_kanji.map((k, i) => (
              <li key={i} className="flex items-center space-x-4 p-3 bg-gray-700 rounded-md">
                <span className="text-3xl text-white">{k.kanji}</span>
                <div>
                  <p className="text-lg text-gray-300">{k.reading}</p>
                  <p className="text-md text-gray-400">{k.meaning}</p>
                </div>
              </li>
            ))
          ) : (
             <p className="text-gray-400 italic">No component kanji provided.</p>
          )}
        </ul>
      </div>
    </>
  );

  const renderKanjiLesson = (lesson: KanjiLesson) => (
    <>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Meaning</h2>
        <p className="text-lg text-gray-300">{lesson.meaning}</p>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Radicals</h2>
        <ul className="flex flex-wrap gap-4">
          {/* --- FIX: Add safety check --- */}
          {lesson.radicals && lesson.radicals.length > 0 ? (
            lesson.radicals.map((r, i) => (
              <li key={i} className="p-4 bg-gray-700 rounded-md text-center">
                <span className="text-3xl text-white">{r.radical}</span>
                <p className="text-md text-gray-400">{r.meaning}</p>
              </li>
            ))
          ) : (
            <p className="text-gray-400 italic">No radicals provided.</p>
          )}
        </ul>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Meaning Mnemonic</h2>
        <p className="text-lg text-gray-300 italic">{lesson.mnemonic_meaning}</p>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Readings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-400 mb-2">On'yomi (Katakana)</h3>
            <ul className="space-y-2">
              {/* --- FIX: Add safety check --- */}
              {lesson.reading_onyomi && lesson.reading_onyomi.length > 0 ? (
                lesson.reading_onyomi.map((r, i) => (
                  <li key={i} className="p-3 bg-gray-700 rounded-md">
                    <span className="text-2xl text-white">{r.reading}</span>
                    <p className="text-md text-gray-400">e.g., {r.example}</p>
                  </li>
                ))
              ) : (
                <p className="text-gray-400 italic">No on'yomi provided.</p>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-400 mb-2">Kun'yomi (Hiragana)</h3>
            <ul className="space-y-2">
              {/* --- FIX: Add safety check --- */}
              {lesson.reading_kunyomi && lesson.reading_kunyomi.length > 0 ? (
                lesson.reading_kunyomi.map((r, i) => (
                  <li key={i} className="p-3 bg-gray-700 rounded-md">
                    <span className="text-2xl text-white">{r.reading}</span>
                    <p className="text-md text-gray-400">e.g., {r.example}</p>
                  </li>
                ))
              ) : (
                <p className="text-gray-400 italic">No kun'yomi provided.</p>
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-white">Reading Mnemonic</h2>
        <p className="text-lg text-gray-300 italic">{lesson.mnemonic_reading}</p>
      </div>
    </>
  );

  const renderFacetChecklist = () => (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-4 text-white">Choose What to Learn</h2>
      <div className="space-y-4">
        
        {/* --- Render logic depends on lesson type --- */}
        {lesson?.type === 'Vocab' && (
          <>
            <label className="flex items-center p-4 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Definition']}
                onChange={() => handleCheckboxChange('Content-to-Definition')}
              />
              <span className="ml-3 text-lg text-white">Meaning</span>
            </label>
            <label className="flex items-center p-4 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Reading']}
                onChange={() => handleCheckboxChange('Content-to-Reading')}
              />
              <span className="ml-3 text-lg text-white">Reading</span>
            </label>
            
            {/* Component Kanji Facets for Vocab (with safety check) */}
            {lesson.component_kanji && lesson.component_kanji.map((kanji, index) => (
              <div key={`${kanji.kanji}-${index}`} className="p-4 bg-gray-750 rounded-md">
                <h3 className="text-xl font-semibold text-gray-300 mb-2">Kanji: {kanji.kanji}</h3>
                <label className="flex items-center p-2 rounded-md hover:bg-gray-600 cursor-pointer">
                  <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={!!selectedFacets[`Kanji-Component-Meaning-${kanji.kanji}`]}
                    onChange={() => handleCheckboxChange(`Kanji-Component-Meaning-${kanji.kanji}`)}
                  />
                  <span className="ml-3 text-lg text-white">Learn Meaning ({kanji.meaning})</span>
                </label>
                <label className="flex items-center p-2 rounded-md hover:bg-gray-600 cursor-pointer">
                  <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={!!selectedFacets[`Kanji-Component-Reading-${kanji.kanji}`]}
                    onChange={() => handleCheckboxChange(`Kanji-Component-Reading-${kanji.kanji}`)}
                  />
                  <span className="ml-3 text-lg text-white">Learn Reading ({kanji.reading})</span>
                </label>
              </div>
            ))}
          </>
        )}

        {lesson?.type === 'Kanji' && (
          <>
            <label className="flex items-center p-4 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Definition']}
                onChange={() => handleCheckboxChange('Content-to-Definition')}
              />
              <span className="ml-3 text-lg text-white">Meaning (Kanji -{'>'} Meaning)</span>
            </label>
            <label className="flex items-center p-4 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer">
              <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets['Content-to-Reading']}
                onChange={() => handleCheckboxChange('Content-to-Reading')}
              />
              <span className="ml-3 text-lg text-white">Reading (Kanji -{'>'} On'yomi/Kun'yomi)</span>
            </label>
          </>
        )}

        {/* AI-Generated Question Facet - Always an option */}
        <label className="flex items-center p-4 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer">
          <input type="checkbox" className="h-5 w-5 rounded bg-gray-900 border-gray-600 text-blue-600 focus:ring-blue-500"
            checked={!!selectedFacets['AI-Generated-Question']}
            onChange={() => handleCheckboxChange('AI-Generated-Question')}
          />
          <span className="ml-3 text-lg text-white">AI-Generated Quiz Questions</span>
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

  if (!isLoading && lesson) {
    console.log("Rendering lesson, lesson object:", JSON.stringify(lesson, null, 2));
    if (lesson.type === 'Kanji') {
      console.log("Is Kanji, lesson.kanji value:", (lesson as KanjiLesson).kanji); 
    }
  }

  // --- Main Render ---
  return (
    <main className="container mx-auto max-w-4xl p-8">
      <header className="mb-8">
        <h1 className="text-6xl font-bold text-white mb-2 break-all">
          {isLoading ? '...' 
           : lesson?.type === 'Kanji' && (lesson as KanjiLesson).kanji ? (lesson as KanjiLesson).kanji // Use lesson.kanji if it exists
           : ku?.content || '...' // Fallback to ku.content
          }
        </h1>
        <p className="text-2xl text-gray-400 capitalize">
          {ku ? ku.type : '...'}
        </p>
      </header>

      {isLoading && <p className="text-xl text-center text-gray-400">Loading lesson...</p>}
      {error && <div className="bg-red-800 border border-red-600 text-red-100 p-4 rounded-md mb-6">{error}</div>}
      
      {/* --- Render the correct lesson based on type --- */}
      {lesson && lesson.type === 'Vocab' && renderVocabLesson(lesson as VocabLesson)}
      {lesson && lesson.type === 'Kanji' && renderKanjiLesson(lesson as KanjiLesson)}
      
      {/* --- Render checklist (only after lesson is loaded) --- */}
      
      {!isLoading && !error && lesson && (
        <>
          {console.log("Render conditions met, lesson object:", lesson)}
          {renderFacetChecklist()}
        </>
      )}
      
    </main>
  );
}
