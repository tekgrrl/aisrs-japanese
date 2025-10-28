'use client';

import React, { useState, useEffect } from 'react';
import { KnowledgeUnit } from '@/types';
import { db } from '@/lib/firebase-client';
import {
  query,
  collection,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';

// Define the Lesson interface locally
interface Lesson {
  meaning_explanation: string;
  reading_explanation: string;
  context_examples: {
    sentence: string;
    translation: string;
  }[];
  component_kanji: {
    kanji: string;
    reading: string;
    meaning: string;
  }[];
}

export default function LearnPage() {
  const [ku, setKu] = useState<KnowledgeUnit | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLesson = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 1. Fetch the first "learning" KU
        const kuQuery = query(
          collection(db, 'knowledge-units'),
          where('status', '==', 'learning'),
          limit(1)
        );
        const querySnapshot = await getDocs(kuQuery);
        console.log('Query ran, snapshot empty:', querySnapshot.empty, 'Size:', querySnapshot.size);

        if (querySnapshot.empty) {
          setError('No items in the learning queue.');
          setKu(null);
          setLesson(null);
          return;
        }

        const kuDoc = querySnapshot.docs[0];
        const kuData = { id: kuDoc.id, ...kuDoc.data() } as KnowledgeUnit;
        setKu(kuData);

        // 2. Fetch the AI-generated Lesson
        const lessonResponse = await fetch('/api/generate-lesson', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ kuId: kuDoc.id }),
        });

        if (!lessonResponse.ok) {
          const errData = await lessonResponse.json();
          throw new Error(errData.error || 'Failed to generate lesson');
        }

        const lessonData = await lessonResponse.json();
        setLesson(lessonData);
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError('An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLesson();
  }, []);

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Learning Queue</h1>
        <p className="text-xl text-gray-400">Loading lesson...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-4xl font-bold text-red-400 mb-4">Error</h1>
        <p className="text-xl text-gray-400">{error}</p>
      </main>
    );
  }

  if (!ku || !lesson) {
    return (
      <main className="container mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">All Done!</h1>
        <p className="text-xl text-gray-400">The learning queue is empty.</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto max-w-3xl p-8">
      {/* Header */}
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h1 className="text-6xl font-bold text-center text-white break-words">
          {ku.content}
        </h1>
      </div>

      {/* Meaning Section */}
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h2 className="text-3xl font-semibold text-blue-300 mb-4 border-b-2 border-blue-300 pb-2">
          Meaning
        </h2>
        <p className="text-xl text-gray-200 leading-relaxed">
          {lesson.meaning_explanation}
        </p>
      </div>

      {/* Reading Section */}
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h2 className="text-3xl font-semibold text-purple-300 mb-4 border-b-2 border-purple-300 pb-2">
          Reading
        </h2>
        <p className="text-xl text-gray-200 leading-relaxed">
          {lesson.reading_explanation}
        </p>
      </div>

      {/* Context Examples Section */}
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h2 className="text-3xl font-semibold text-green-300 mb-4 border-b-2 border-green-300 pb-2">
          Context Examples
        </h2>
        <ul className="space-y-6">
          {lesson.context_examples.map((ex, index) => (
            <li key={index} className="p-4 bg-gray-700 rounded-md">
              <p className="text-2xl text-white mb-2">{ex.sentence}</p>
              <p className="text-lg text-gray-400">{ex.translation}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Component Kanji Section */}
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg">
        <h2 className="text-3xl font-semibold text-red-300 mb-4 border-b-2 border-red-300 pb-2">
          Component Kanji
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lesson.component_kanji.map((k, index) => (
            <div key={index} className="p-4 bg-gray-700 rounded-md text-center">
              <p className="text-4xl text-white mb-2">{k.kanji}</p>
              <p className="text-lg text-gray-300">{k.reading}</p>
              <p className="text-md text-gray-400">{k.meaning}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
