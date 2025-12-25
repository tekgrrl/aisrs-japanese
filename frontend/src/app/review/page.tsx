"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import Link from "next/link";
import { ReviewItem, ReviewFacet, VocabLesson, KanjiLesson } from "@/types";
import * as wanakana from "wanakana";
import { logger } from "@/lib/logger";
import { QuestionFeedbackModal } from "@/components/QuestionFeedbackModal";
import EditKnowledgeUnitModal from "@/components/EditKnowledgeUnitModal";
import { KnowledgeUnit } from "@/types";

type AnswerState = "unanswered" | "evaluating" | "correct" | "incorrect";

export default function ReviewPage() {
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userAnswer, setUserAnswer] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [aiExplanation, setAiExplanation] = useState("");
  const [sessionFailureCounts, setSessionFailureCounts] = useState<
    Record<string, number>
  >({});

  // --- State for AI-Generated Questions ---
  const [isFetchingDynamicQuestion, setIsFetchingDynamicQuestion] =
    useState(false);
  const [dynamicQuestion, setDynamicQuestion] = useState<string | null>(null);
  const [dynamicAnswer, setDynamicAnswer] = useState<string | null>(null);
  const [dynamicContext, setDynamicContext] = useState<string | null>(null);
  const [dynamicAltAnswers, setDynamicAltAnswers] = useState<string[]>([]);
  const [dynamicQuestionId, setDynamicQuestionId] = useState<string | null>(null);

  // --- Feedback Modal State ---
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const [pendingSrsResult, setPendingSrsResult] = useState<"pass" | "fail" | null>(null);

  // --- Edit Modal State ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingKu, setEditingKu] = useState<KnowledgeUnit | null>(null);

  const currentItem = reviewQueue[currentIndex];

  const reviewCount = reviewQueue.length;

  const lastFetchedIndex = useRef<number | null>(null);

  // --- Fetch Dynamic Question Logic ---
  const fetchDynamicQuestion = async (
    topic: string,
    facetId: string,
    kuId: string,
  ) => {
    setIsFetchingDynamicQuestion(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/questions/generate?topic=${encodeURIComponent(topic)}&facetId=${facetId}&kuId=${kuId}`,
        // `/api/generate-question?topic=${encodeURIComponent(topic)}&facetId=${facetId}&kuId=${kuId}`,
      );
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate question");
      }
      const { question, answer, context, accepted_alternatives, questionId } =
        await response.json();
      setDynamicQuestion(question);
      setDynamicAnswer(answer);
      setDynamicContext(context || null);
      setDynamicAltAnswers(accepted_alternatives || null);
      setDynamicQuestionId(questionId || null);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("An unknown error occurred");
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
        // TODO usenestjs backend service instead
        const response = await fetch("/api/reviews/facets?due=true");
        if (!response.ok) {
          throw new Error("Failed to fetch due review items");
        }
        const data: ReviewItem[] = await response.json();
        setReviewQueue(shuffleArray(data));
      } catch (err) {
        if (err instanceof Error) setError(err.message);
        else setError("An unknown error occurred");
      } finally {
        setIsLoading(false);
      }
    };
    fetchDueItems();
  }, []);

  // --- Effect to handle current item changes ---
  useEffect(() => {
    if (
      currentItem &&
      currentItem.facet.facetType === "AI-Generated-Question"
    ) {
      // --- FIX: Double Fetch Prevention ---
      // If we have already triggered a fetch for this exact index, do nothing.
      if (lastFetchedIndex.current === currentIndex) {
        return;
      }

      // Mark this index as fetched
      lastFetchedIndex.current = currentIndex;

      setDynamicQuestion(null);
      setDynamicAnswer(null);
      setDynamicAltAnswers([]);
      setDynamicContext(null);
      setDynamicQuestionId(null);

      fetchDynamicQuestion(
        currentItem.ku.content,
        currentItem.facet.id,
        currentItem.ku.id,
      );
    } else {
      setDynamicQuestion(null);
      setDynamicAnswer(null);
      setDynamicAltAnswers([]);
      setDynamicContext(null);
      setDynamicQuestionId(null);
    }
  }, [currentItem, currentIndex]); // Re-run whenever the currentItem OR the index changes

  function shuffleArray<T>(array: T[]): T[] {
    // Create a copy to avoid mutating the original state directly
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  // --- Core SRS Logic ---

  const handleUpdateSrs = async (result: "pass" | "fail") => {
    if (!currentItem) return;
    try {
      const response = await fetch(
        `/api/reviews/facets/${currentItem.facet.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ result }),
        },
      );
      if (!response.ok) throw new Error("Failed to update SRS data");

      // SUCCESS! The API call finished and was OK.
      // *Now* we dispatch the event from the client.
      window.dispatchEvent(new Event("refreshStats"));
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError("An unknown error occurred");
    }
  };

  const updateQuestionStatus = async (
    questionId: string,
    status: "active" | "flagged" | "inactive",
  ) => {
    try {
      // TODO use nestjs backend service instead
      const res = await fetch(`/api/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        console.error(`[ReviewPage] updateQuestionStatus failed: ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to update question status", err);
    }
  };

  const isNewAiQuestion = (item: ReviewItem) => {
    if (item.facet.facetType !== "AI-Generated-Question") return false;
    
    // If we don't have a dynamic question ID yet, we can't determine.
    // But this is called during answer evaluation, so it should be set.
    if (!dynamicQuestionId) return false;

    // If the facet has a recorded question ID that matches the current one,
    // it means we've seen this question before (and failed it).
    if (item.facet.currentQuestionId === dynamicQuestionId) {
      return false;
    }

    // Otherwise (no recorded ID, or different ID), it's a new question.
    return true;
  };

  const handleEvaluateAnswer = async (e: FormEvent) => {
    e.preventDefault();
    if (answerState !== "unanswered" || !currentItem) return;

    // --- New: Short-circuit for empty answer ---
    if (userAnswer.trim() === "") {
      setAiExplanation("No answer provided.");
      
      // Check if we need to defer SRS update
      if (isNewAiQuestion(currentItem)) {
        setPendingSrsResult("fail");
        // Do NOT call handleUpdateSrs here
      } else {
        await handleUpdateSrs("fail");
      }
      
      setAnswerState("incorrect");

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

    setAnswerState("evaluating");
    setError(null);
    setAiExplanation("");

    const expectedAnswers = getExpectedAnswer(currentItem); // Now using array
    const question = getQuestion(currentItem);
    const topic = currentItem.ku.content; // The "topic" is the KU content
    const questionType = getQuestionType(currentItem); // Get the question type
    // Use dynamicQuestionId if available (for AI questions), otherwise fallback to facet's currentQuestionId (though that might be stale)
    const questionId = dynamicQuestionId || currentItem.facet.currentQuestionId;

    // TODO This shouldn't work
    if (
      expectedAnswers.length === 0 &&
      currentItem.facet.facetType === "AI-Generated-Question"
    ) {
      setError("Waiting for dynamic question to load.");
      setAnswerState("unanswered");
      return;
    }

    try {
      const response = await fetch("/api/reviews/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userAnswer,
          expectedAnswers,
          question,
          topic,
          questionType, // Add questionType to the payload
          questionId, // Add questionId to the payload
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Evaluation API failed");
      }

      const { result, explanation } = await response.json();
      setAiExplanation(explanation);

      if (result === "pass") {
        if (isNewAiQuestion(currentItem)) {
          setPendingSrsResult("pass");
        } else {
          await handleUpdateSrs("pass");
        }
        setAnswerState("correct");
      } else {
        if (isNewAiQuestion(currentItem)) {
          setPendingSrsResult("fail");
        } else {
          await handleUpdateSrs("fail");
        }
        setAnswerState("incorrect");

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
      else setError("An unknown error occurred");
      setAnswerState("unanswered");
    }
  };

  const handleSkip = () => {
    advanceToNext();
  };

  const goToNextItem = () => {
    // If it's a new AI question and we haven't shown feedback yet
    const isNew = isNewAiQuestion(currentItem);
    
    if (isNew && pendingSrsResult) {
      setShowFeedbackModal(true);
      return;
    }

    advanceToNext();
  };

  const advanceToNext = () => {
    setUserAnswer("");
    setAnswerState("unanswered");
    setAiExplanation("");
    setPendingSrsResult(null);
    setShowFeedbackModal(false);
    // Use functional update to ensure we use the latest state
    setCurrentIndex((prevIndex) => prevIndex + 1);
  };

  // --- Edit Handlers ---
  const handleEditClick = () => {
    if (currentItem) {
      setEditingKu(currentItem.ku);
      setIsEditModalOpen(true);
    }
  };

  const handleSaveKu = async (id: string, updates: Partial<KnowledgeUnit>) => {
    try {
      // 1. Update backend
      // TODO needs nextjs rewrite
      const response = await fetch(`/api/knowledge-units/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error("Failed to update unit");
      }

      const updatedKu = await response.json(); // Assuming backend returns the updated KU

      // 2. Update local state (reviewQueue) to reflect changes immediately
      setReviewQueue((prevQueue) =>
        prevQueue.map((item) => {
          if (item.ku.id === id) {
            // Merge updates into the KU
            return {
              ...item,
              ku: {
                ...item.ku,
                ...updates,
                 ...updatedKu, 
              },
            };
          }
          return item;
        })
      );
      
      window.dispatchEvent(new CustomEvent("refreshStats"));
    } catch (err) {
      console.error(err);
      alert("Failed to save changes"); // Simple alert for now
    }
  };

  const handleFeedbackKeep = async () => {
    if (pendingSrsResult) {
      await handleUpdateSrs(pendingSrsResult);
    }
    // Status is already 'active' by default, so no need to patch unless we want to be explicit
    // But let's be safe and ensure it's active if it was somehow not
    if (dynamicQuestionId) {
        await updateQuestionStatus(dynamicQuestionId, "active");
        
        // Update local facet state so if it reappears, it's not "new"
        if (currentItem) {
            currentItem.facet.currentQuestionId = dynamicQuestionId;
        }
    } else {
        console.warn("[ReviewPage] handleFeedbackKeep: No dynamicQuestionId to update");
    }
    advanceToNext();
  };

  const handleFeedbackRequestNew = async () => {
    // Mark as inactive
    if (dynamicQuestionId) {
      await updateQuestionStatus(dynamicQuestionId, "inactive");
    }
    // Do NOT record SRS history (skip handleUpdateSrs)
    // But we DO need to make sure this item stays in the queue?
    // The requirement says: "Re-queue the review facet so it appears again later (with a fresh question)."
    // If we just advance index, it's gone from this session (unless we re-add it?)
    // But `reviewQueue` is static for the session usually.
    // If we want it to appear *later*, we can just leave it alone.
    // But we are advancing index.
    // If we want it to appear *in this session* again, we should append it to queue?
    // "Re-queue... so it appears again later". This could mean "next session".
    // If we don't update SRS, `nextReviewAt` is still in the past. So it will be fetched next time.
    // So advancing index is fine. It will just be skipped for now.
    
    advanceToNext();
  };

  const handleFeedbackReport = async () => {
    // Mark as flagged
    if (dynamicQuestionId) {
      await updateQuestionStatus(dynamicQuestionId, "flagged");

      // Update local facet state so if it reappears, it's not "new"
      if (currentItem) {
          currentItem.facet.currentQuestionId = dynamicQuestionId;
      }
    }
    
    // Record SRS tracking data based on the ACTUAL result (pass or fail)
    // Just like "Keep", we respect the user's answer.
    if (pendingSrsResult) {
      await handleUpdateSrs(pendingSrsResult);
    }

    advanceToNext();
  };

  // --- Helper Functions ---

  const getQuestion = (item: ReviewItem): string | null => {
    const { ku, facet } = item;
    switch (facet.facetType) {
      case "AI-Generated-Question":
        return dynamicQuestion; // Returns null if loading
      case "Content-to-Definition":
      case "Content-to-Reading":
        return ku.content;
      case "Kanji-Component-Meaning":
      case "Kanji-Component-Reading":
        return ku.content;
      case "Definition-to-Content":
        return ku.data?.definition || "[No Definition]";
      case "Reading-to-Content":
        return ku.data?.reading || "[No Reading]";
      default:
        return "Unknown Facet";
    }
  };

  const getQuestionType = (item: ReviewItem): string => {
    switch (item.facet.facetType) {
      case "AI-Generated-Question":
        return `AI Quiz`;
      case "Content-to-Definition":
        return "Vocab Definition";
      case "Content-to-Reading":
        return "Vocab Reading";
      case "Kanji-Component-Meaning":
        return "Kanji Component Meaning";
      case "Kanji-Component-Reading":
        return "Kanji Component Reading";
      case "Definition-to-Content":
      case "Reading-to-Content":
        return "Vocab/Kanji";
      default:
        return "...";
    }
  };

  // Helper to check if we should auto-convert
  const isJapaneseInput = (item: ReviewItem) => {
    const type = item.facet.facetType;
    // Add any other types that expect Japanese input
    return (
      type === "Content-to-Reading" ||
      type === "Kanji-Component-Reading" ||
      type === "AI-Generated-Question"
    );
  };

  const getExpectedAnswer = (item: ReviewItem): string[] => {
    const { ku, facet } = item;

    // 1. Handle AI-Generated questions first
    if (facet.facetType === "AI-Generated-Question") {
      const allExpectedAnswers = [...dynamicAltAnswers]; // initialize

      if (dynamicAnswer) {
        allExpectedAnswers.push(dynamicAnswer);
      }
      console.log("Expected answers for AI-Generated Question:", allExpectedAnswers);
      return allExpectedAnswers;
    }

    // 2. Handle "reverse" quizzes
    if (
      facet.facetType === "Definition-to-Content" ||
      facet.facetType === "Reading-to-Content"
    ) {
      console.log("Expected answers for reverse quiz:", [ku.content]);
      return [ku.content];
    }

    // 3. Handle "forward" quizzes (Content-to-...)
    if (ku.type === "Vocab") {
      // --- VOCAB LOGIC ---
      const lesson = item.lesson as VocabLesson | undefined;
      if (facet.facetType === "Content-to-Definition") {
        // Collect all potential definition strings
        const rawDefinitions: string[] = [];
        
        // 1. From Lesson (array)
        if (lesson?.definitions && Array.isArray(lesson.definitions)) {
          rawDefinitions.push(...lesson.definitions);
        }
        
        // 2. From KU (string)
        if (ku.data?.definition) {
          rawDefinitions.push(ku.data.definition);
        }

        // Process: split by delimiters (comma, semicolon), trim, filter empty
        const uniqueDefinitions = Array.from(new Set(
          rawDefinitions
            .flatMap((def) => def.split(/[,;]/)) // Split by , or ;
            .map((def) => def.trim())
            .filter((def) => def.length > 0)
        ));
        
        console.log("Expected answers for Content-to-Definition:", uniqueDefinitions);
        return uniqueDefinitions;
      }
      if (facet.facetType === "Content-to-Reading") {
        // Use lesson first, fallback to older ku.data
        console.log("Expected answers for Content-to-Reading:", [ku.data?.reading || lesson?.reading_explanation || ""]);
        return [ku.data?.reading || lesson?.reading_explanation || ""];
      }
    } else if (ku.type === "Kanji") {
      // --- KANJI LOGIC ---
      if (facet.facetType === "Content-to-Definition") {
        // Kanji "definition" is the 'meaning' field from the lesson
        const kanjiDefinitionString = ku.data?.meaning || "";
        return kanjiDefinitionString.split(",").map((answer) => answer.trim());
      }
      if (facet.facetType === "Content-to-Reading") {
        // Kanji "reading" is a combination of all onyomi and kunyomi
        const onyomi = ku.data?.onyomi || [];
        const kunyomi = ku.data?.kunyomi || [];
        const allReadings = [...onyomi, ...kunyomi];

        if (allReadings.length > 0) {
          return allReadings; // facilitate Gemini short circuit
          //return allReadings.join(', '); // e.g., "ドク, トク, よむ"
        }
        // Fallback just in case lesson is old/missing
        console.log("Expected answers for Content-to-Reading (fallback):", [ku.data?.onyomi || ku.data?.kunyomi || ""]);
        return ku.data?.onyomi || ku.data?.kunyomi || [];
      }
    }

    // --- KANJI COMPONENT LOGIC ---
    if (facet.facetType === "Kanji-Component-Meaning") {  

      const meaningStr = ku.data?.meaning || ""; 
      
      return meaningStr.split(',').map(s => s.trim()).filter(s => s);
    }
    if (facet.facetType === "Kanji-Component-Reading") {

      return ku.data?.onyomi || [];
    }

    // Fallback for any other combo
    logger.warn(
      `getExpectedAnswer: No answer path for ${ku.type} / ${facet.facetType}`,
    );
    return [];
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
  const questionText = getQuestion(currentItem);
  const isDynamicLoading =
    currentItem.facet.facetType === "AI-Generated-Question" &&
    (isFetchingDynamicQuestion || !questionText);

  return (
    <main className="container mx-auto max-w-2xl p-8">
      <header className="mb-6">
        <span className="text-lg text-gray-400">
          Item {currentIndex + 1} of {reviewCount}
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
            <>
              {/* Render Context ONLY if it's a dynamic quiz AND we have context */}
              {currentItem.facet.facetType === "AI-Generated-Question" &&
                dynamicContext && (
                  <p className="text-xl text-gray-300 mb-4 italic">
                    {dynamicContext}
                  </p>
                )}

              {/* Main Question Text */}
              <p
                className={`${currentItem.facet.facetType === "AI-Generated-Question" || currentItem.facet.facetType === "Definition-to-Content" ? "text-2xl" : "text-5xl"} font-bold text-white break-words`}
              >
                {questionText || "[Question not loaded]"}
              </p>
            </>
          )}
        </div>

        {/* Answer Form */}
        <form onSubmit={handleEvaluateAnswer}>
          <input
            key={currentItem.facet.id} // Force re-render (and autoFocus) on new item
            type="text"
            value={userAnswer}
            autoFocus
            onChange={(e) => {
              const input = e.target.value;

              // Only convert if it's a Reading question
              if (isJapaneseInput(currentItem)) {
                // toKana with IMEMode: true mimics real typing behavior
                // e.g., typing 'n' waits to see if 'a' comes next (な) or another 'n' (ん)
                const converted = wanakana.toKana(input, { IMEMode: true });
                setUserAnswer(converted);
              } else {
                // For meanings/definitions, just pass raw text
                setUserAnswer(input);
              }
            }}
            placeholder={
              getQuestionType(currentItem) === "Definition"
                ? "Type your answer..."
                : "回答を入力して..."
            }
            disabled={answerState !== "unanswered" || isDynamicLoading}
            className="w-full p-4 bg-gray-700 border-2 border-gray-600 text-white text-xl rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-800 disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={answerState !== "unanswered" || isDynamicLoading}
            className="w-full mt-4 px-6 py-4 bg-blue-600 text-white text-xl font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-500 disabled:cursor-wait"
          >
            {answerState === "evaluating" ? "Evaluating..." : "Submit Answer"}
          </button>
          
          <button
            type="button"
            onClick={handleSkip}
            disabled={answerState !== "unanswered" || isDynamicLoading}
            className="w-full mt-4 px-6 py-3 bg-gray-500 text-white text-lg font-semibold rounded-md shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:bg-gray-800 disabled:text-gray-500"
          >
            Skip
          </button>
        </form>
      </div>

      {/* --- Answer Feedback Section --- */}
      {answerState !== "unanswered" && answerState !== "evaluating" && (
        <div
          className={`mt-8 p-6 rounded-lg ${
            answerState === "correct"
              ? "bg-green-800 border-green-600"
              : "bg-red-800 border-red-600"
          }`}
        >
          <h3 className="text-2xl font-semibold text-white mb-3">
            {answerState === "correct" ? "Correct" : "Incorrect"}
          </h3>
          <p className="text-lg text-gray-200 mb-2">
            <span className="font-semibold">Your answer:</span> {userAnswer}
          </p>
          {answerState === "incorrect" && (
            <p className="text-lg text-gray-200 mb-4">
              <span className="font-semibold">Correct answer:</span>{" "}
              {getExpectedAnswer(currentItem).join(" / ")}
            </p>
          )}
          {aiExplanation === "No answer provided." ? (
            <p className="text-lg text-gray-200 italic">{aiExplanation}</p>
          ) : (
            <p className="text-lg text-gray-200 italic">
              <span className="font-semibold">AI:</span> {aiExplanation}
            </p>
          )}

          {answerState === "incorrect" && currentItem && (
            <div className="mt-4">
              <Link
                href={`/learn/${currentItem.ku.id}?source=review`}
                className="inline-block px-4 py-2 bg-[#0A5C36] text-white font-semibold rounded-md hover:bg-[#084a2b]"
              >
                Review lesson on {currentItem.ku.content}
              </Link>
            </div>

          )}

          <div className="mt-6 flex gap-4">
             <button
              onClick={handleEditClick}
              className="px-4 py-3 bg-gray-600 text-white font-semibold rounded-md shadow-md hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Edit KU
            </button>
            <button
              onClick={goToNextItem}
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <EditKnowledgeUnitModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveKu}
        knowledgeUnit={editingKu}
      />

      <QuestionFeedbackModal
        isOpen={showFeedbackModal}
        onKeep={handleFeedbackKeep}
        onRequestNew={handleFeedbackRequestNew}
        onReport={handleFeedbackReport}
      />
    </main>
  );
}
