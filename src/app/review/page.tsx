"use client";

import React, { useState, useEffect, useRef, FormEvent } from 'react';
import Link from 'next/link';
import { ReviewItem, ReviewFacet, VocabLesson, KanjiLesson } from '@/types';
import { logger } from '@/lib/logger';

type AnswerState = 'unanswered' | 'evaluating' | 'correct' | 'incorrect';

export default function ReviewPage() {
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userAnswer, setUserAnswer] = useState('');
  const [answerState, setAnswerState] = useState<AnswerState>('unanswered');
  const [aiExplanation, setAiExplanation] = useState('');
  const [sessionFailureCounts, setSessionFailureCounts] = useState<Record<string, number>>({});

  // --- State for AI-Generated Questions ---
  const [isFetchingDynamicQuestion, setIsFetchingDynamicQuestion] = useState(false);
  const [dynamicQuestion, setDynamicQuestion] = useState<string | null>(null);
  const [dynamicAnswer, setDynamicAnswer] = useState<string | null>(null);

  const currentItem = reviewQueue[currentIndex];



  // --- Fetch Dynamic Question Logic ---
  const fetchDynamicQuestion = async (topic: string) => {
    setIsFetchingDynamicQuestion(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/generate-question?topic=${encodeURIComponent(topic)}`
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate question');
      }
      const { question, answer } = await response.json();
      setDynamicQuestion(question);
      setDynamicAnswer(answer);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
    } finally {
      setIsFetchingDynamicQuestion(false);
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    const fetchDueItems = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('/api/review-facets?due=true');
        if (!response.ok) {
          throw new Error('Failed to fetch due review items');
        }
        const data: ReviewItem[] = await response.json();
        setReviewQueue(data);
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError('An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDueItems();
  }, []);

  // --- Effect to handle current item changes ---
  useEffect(() => {
    if (currentItem && currentItem.facet.facetType === 'AI-Generated-Question') {
      setDynamicQuestion(null);
      setDynamicAnswer(null);
      fetchDynamicQuestion(currentItem.ku.content);
    } else {
      setDynamicQuestion(null);
      setDynamicAnswer(null);
    }
  }, [currentItem, currentIndex]); // Re-run whenever the currentItem OR the index changes

  // --- Core SRS Logic ---

  const handleUpdateSrs = async (result: 'pass' | 'fail') => {
    if (!currentItem) return;
    try {
      const response = await fetch(
        `/api/review-facets/${currentItem.facet.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ result }),
        }
      );
      if (!response.ok) throw new Error('Failed to update SRS data');

      // SUCCESS! The API call finished and was OK.
      // *Now* we dispatch the event from the client.
      window.dispatchEvent(new Event('refreshStats'));
      
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
    }
  };

  const handleEvaluateAnswer = async (e: FormEvent) => {
    e.preventDefault();
    if (answerState !== 'unanswered' || !currentItem) return;

    // --- New: Short-circuit for empty answer ---
    if (userAnswer.trim() === '') {
      setAiExplanation('No answer provided.');
      await handleUpdateSrs('fail');
      setAnswerState('incorrect');

      const facetId = currentItem.facet.id;
      const newFailureCount = (sessionFailureCounts[facetId] || 0) + 1;
      setSessionFailureCounts((prevCounts) => ({
        ...prevCounts,
        [facetId]: newFailureCount,
      }));
      if (newFailureCount < 2) {
        setReviewQueue((prevQueue) => [...prevQueue, currentItem]);
      }
      return;
    }
    // --- End New ---

    setAnswerState('evaluating');
    setError(null);
    setAiExplanation('');

    const expectedAnswer = getExpectedAnswer(currentItem);
    const question = getQuestion(currentItem);
    const topic = currentItem.ku.content; // The "topic" is the KU content
    const questionType = getQuestionType(currentItem); // Get the question type

    if (expectedAnswer === null) {
      setError('Waiting for dynamic question to load.');
      setAnswerState('unanswered');
      return;
    }

    try {
      const response = await fetch('/api/evaluate-answer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAnswer,
          expectedAnswer,
          question,
          topic,
          questionType, // Add questionType to the payload
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Evaluation API failed');
      }

      const { result, explanation } = await response.json();
      setAiExplanation(explanation);

      if (result === 'pass') {
        await handleUpdateSrs('pass');
        setAnswerState('correct');
      } else {
        await handleUpdateSrs('fail');
        setAnswerState('incorrect');

        const facetId = currentItem.facet.id;
        const newFailureCount = (sessionFailureCounts[facetId] || 0) + 1;

        setSessionFailureCounts((prevCounts) => ({
          ...prevCounts,
          [facetId]: newFailureCount,
        }));

        // Only re-queue if failed less than 2 times in this session
        if (newFailureCount < 2) {
          setReviewQueue((prevQueue) => [...prevQueue, currentItem]);
        }
      }
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('An unknown error occurred');
      setAnswerState('unanswered');
    }
  };

  const goToNextItem = () => {
    setUserAnswer('');
    setAnswerState('unanswered');
    setAiExplanation('');
    // Use functional update to ensure we use the latest state
    setCurrentIndex((prevIndex) => prevIndex + 1);
  };

  // --- Helper Functions (Updated) ---

  const getQuestion = (item: ReviewItem): string | null => {
    const { ku, facet } = item;
    switch (facet.facetType) {
      case 'AI-Generated-Question':
        return dynamicQuestion; // Returns null if loading
      case 'Content-to-Definition':
      case 'Content-to-Reading':
        return ku.content;
      case 'Kanji-Component-Meaning':
      case 'Kanji-Component-Reading':
        return ku.content;
      case 'Definition-to-Content':
        return ku.data?.definition || '[No Definition]';
      case 'Reading-to-Content':
        return ku.data?.reading || '[No Reading]';
      default:
        return 'Unknown Facet';
    }
  };

  const getQuestionType = (item: ReviewItem): string => {
    console.log(`facetType = ${item.facet.facetType}`); // TODO This is wrong here for Kanji 
    switch (item.facet.facetType) {
      case 'AI-Generated-Question':
        return `Quiz: ${item.ku.content}`;
      case 'Content-to-Definition':
        return 'Vocab Definition';
      case 'Content-to-Reading':
        return 'Vocab Reading';
      case 'Kanji-Component-Meaning':
        return 'Kanji Component Meaning';
      case 'Kanji-Component-Reading':
        return 'Kanji Component Reading';
      case 'Definition-to-Content':
      case 'Reading-to-Content':
        return 'Vocab/Kanji';
      default:
        return '...';
    }
  };

  const getExpectedAnswer = (item: ReviewItem): string | null => {
    const { ku, facet } = item;

    // 1. Handle AI-Generated questions first
    if (facet.facetType === 'AI-Generated-Question') {
      return dynamicAnswer; // This remains as-is
    }

    // 2. Handle "reverse" quizzes
    if (facet.facetType === 'Definition-to-Content' || facet.facetType === 'Reading-to-Content') {
      return ku.content;
    }

    // 3. Handle "forward" quizzes (Content-to-...)
    if (ku.type === 'Vocab') {
      // --- VOCAB LOGIC ---
      const lesson = item.lesson as VocabLesson | undefined;
      if (facet.facetType === 'Content-to-Definition') {
        // Use lesson first, fallback to older ku.data
        return lesson?.meaning_explanation || ku.data?.definition || '';
      }
      if (facet.facetType === 'Content-to-Reading') {
        // Use lesson first, fallback to older ku.data
        return lesson?.reading_explanation || ku.data?.reading || '';
      }
    } 
    else if (ku.type === 'Kanji') {
      // --- KANJI LOGIC ---
      const lesson = item.lesson as KanjiLesson | undefined;
      if (facet.facetType === 'Content-to-Definition') {
        // Kanji "definition" is the 'meaning' field from the lesson
        return lesson?.meaning || ku.data?.meaning || '';
      }
      if (facet.facetType === 'Content-to-Reading') {
        // Kanji "reading" is a combination of all onyomi and kunyomi
        const onyomi = lesson?.reading_onyomi?.map(r => r.reading) || [];
        const kunyomi = lesson?.reading_kunyomi?.map(r => r.reading) || [];
        const allReadings = [...onyomi, ...kunyomi];
        
        if (allReadings.length > 0) {
          return allReadings.join(', '); // e.g., "ドク, トク, よむ"
        }
        // Fallback just in case lesson is old/missing
        return ku.data?.onyomi || ku.data?.kunyomi || '';
      }
    }
    
    // --- KANJI COMPONENT LOGIC ---
    if (facet.facetType === 'Kanji-Component-Meaning') {
      const lesson = item.lesson as KanjiLesson | undefined;
      return lesson?.meaning || ku.data?.definition || '';
    }
    if (facet.facetType === 'Kanji-Component-Reading') {
      const lesson = item.lesson as KanjiLesson | undefined;
      const onyomi = lesson?.reading_onyomi?.map(r => r.reading) || [];
      if (onyomi.length > 0) {
        return onyomi.join(', ');
      }
      return ku.data?.onyomi || '';
    }

    // Fallback for any other combo
    logger.warn(`getExpectedAnswer: No answer path for ${ku.type} / ${facet.facetType}`);
    return '';
  };

  // --- Render Logic ---

  if (isLoading) {
    return (
      <main className="container mx-auto max-w-2xl p-8 text-center">
        <p className="text-xl text-gray-400">Loading reviews...</p>
      </main>
    );
  }

  // Handle both "no items" and "all items done"
  if (!currentItem || currentIndex >= reviewQueue.length) {
    return (
      <main className="container mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          Session Complete!
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          You've finished all your due reviews.
        </p>
        <Link
          href="/"
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700"
        >
          Back to Manage
        </Link>
      </main>
    );
  }

  const questionType = getQuestionType(currentItem);
  console.log(`QuestionType = ${questionType}`);
  const questionText = getQuestion(currentItem);
  const isDynamicLoading =
    currentItem.facet.facetType === 'AI-Generated-Question' &&
    (isFetchingDynamicQuestion || !questionText);

  return (
    <main className="container mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <span className="text-lg text-gray-400">
          Item {currentIndex + 1} of {reviewQueue.length}
        </span>
      </header>

      {error && (
        <div className="bg-red-800 border border-red-600 text-red-100 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* --- Review Card --- */}
      <div className="bg-gray-800 shadow-2xl rounded-lg p-8">
        {/* Question Area */}
        <div className="text-center mb-8 min-h-[160px] flex flex-col justify-center">
          <p className="text-lg font-semibold text-blue-300 mb-3 truncate px-4">
            {questionType}
          </p>
          {isDynamicLoading ? (
            <p className="text-3xl text-gray-400 animate-pulse">
              Generating question...
            </p>
          ) : (
            <p className={`${questionType.startsWith('Quiz') ? 'text-2xl' : 'text-5xl'} font-bold text-white break-words`}>
              {questionText || '[Question not loaded]'}
            </p>
          )}
        </div>

        {/* Answer Form */}
        <form onSubmit={handleEvaluateAnswer}>
          <input
            type="text"
            value={userAnswer}
            key={currentIndex}
            autoFocus
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder={getQuestionType(currentItem) === 'Definition' ? "Type your answer..." : "回答を入力して..."}
            disabled={answerState !== 'unanswered' || isDynamicLoading}
            className="w-full p-4 bg-gray-700 border-2 border-gray-600 text-white text-xl rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-800 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={answerState !== 'unanswered' || isDynamicLoading}
            className="w-full mt-4 px-6 py-4 bg-blue-600 text-white text-xl font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-500 disabled:cursor-wait"
          >
            {answerState === 'evaluating'
              ? 'Evaluating...'
              : 'Submit Answer'}
          </button>
        </form>
      </div>

      {/* --- Answer Feedback Section --- */}
      {answerState !== 'unanswered' && answerState !== 'evaluating' && (
        <div
          className={`mt-8 p-6 rounded-lg ${
            answerState === 'correct'
              ? 'bg-green-800 border-green-600'
              : 'bg-red-800 border-red-600'
          }`}
        >
          <h3 className="text-2xl font-semibold text-white mb-3">
            {answerState === 'correct' ? 'Correct' : 'Incorrect'}
          </h3>
          <p className="text-lg text-gray-200 mb-2">
            <span className="font-semibold">Your answer:</span> {userAnswer}
          </p>
          {answerState === 'incorrect' && (
            <p className="text-lg text-gray-200 mb-4">
              <span className="font-semibold">Correct answer:</span>{' '}
              {getExpectedAnswer(currentItem)}
            </p>
          )}
          {aiExplanation === 'No answer provided.' ? (
            <p className="text-lg text-gray-200 italic">
              {aiExplanation}
            </p>
          ) : (
            <p className="text-lg text-gray-200 italic">
              <span className="font-semibold">AI:</span> {aiExplanation}
            </p>
          )}

          {answerState === 'incorrect' && currentItem && (
            <div className="mt-4">
              <Link
                href={`/learn/${currentItem.ku.id}?source=review`}
                className="inline-block px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
              >
                Review lesson on {currentItem.ku.content}
              </Link>
            </div>
          )}

          <button
            onClick={goToNextItem}
            className="mt-6 w-full px-6 py-3 bg-gray-600 text-white font-semibold rounded-md shadow-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800"
          >
            Next
          </button>
        </div>
      )}
    </main>
  );
}

