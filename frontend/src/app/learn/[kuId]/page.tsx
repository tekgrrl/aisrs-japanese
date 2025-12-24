"use client";

import React, { useState, useEffect, useRef } from "react"; // <-- Import useRef
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  KnowledgeUnit,
  Lesson,
  VocabLesson,
  KanjiLesson,
} from "@/types";
import VocabLessonView from "@/components/lessons/VocabLessonView";
import KanjiLessonView from "@/components/lessons/KanjiLessonView";

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
  const [selectedFacets, setSelectedFacets] = useState<Record<string, boolean>>(
    {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kanjiStatuses, setKanjiStatuses] = useState<Record<string, string>>(
    {},
  );

  const fetchVocabLesson = async (ku: KnowledgeUnit) => {
    setIsLoading(true);
    setError(null);
    setKu(null);
    setLesson(null);
    setKanjiStatuses({});

    try {
      // Most recent change here. Something broke
      const kuResponse = await fetch(`/api/knowledge-units/${kuId}`);
      
      if (!kuResponse.ok) {
          if (kuResponse.status === 404) {
            setError("Learning item not found.");
            return;
          }
          throw new Error("Failed to fetch Knowledge Unit");
      }

      const kuData = await kuResponse.json() as KnowledgeUnit;
      setKu(kuData);

      // 2. Fetch the Lesson for this kuDoc by kuDoc.id
      const lessonResponse = await fetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kuId: kuData.id }),
      });

      if (!lessonResponse.ok) {
        const err = await lessonResponse.json();
        throw new Error(err.error || "Failed to generate lesson");
      }

      const lessonData = (await lessonResponse.json()) as Lesson;
      setLesson(lessonData);
      
      if (
        lessonData.type === "Vocab" &&
        lessonData.component_kanji &&
        lessonData.component_kanji.length > 0
      ) {
        const kanjiChars = lessonData.component_kanji.map((k) => k.kanji);
        const response = await fetch("/api/knowledge-units/get-all?status=learning&content=" + kanjiChars.join(","));

        if (!response.ok) throw new Error(response.statusText);

        const data = (await response.json()) as KnowledgeUnit[]; // Cast here

        const kanjiKus = data.map(
          (thing: KnowledgeUnit) => ({ ...thing }) as KnowledgeUnit,
        );

        const statuses: Record<string, string> = {};

        kanjiKus.forEach((kanjiKu) => {
          statuses[kanjiKu.content] = kanjiKu.status;
        });

        setKanjiStatuses(statuses);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchKanjiLesson = async (ku: KnowledgeUnit) => {
    // Calls your new KanjiService endpoint
    const response = await fetch(
      `/api/kanji/details?char=${encodeURIComponent(ku.content)}&kuId=${ku.id}`
    );

    if (!response.ok) throw new Error("Failed to fetch Kanji details");

    const data = await response.json();
    console.log(`data = ${JSON.stringify(data)}`);
    setLesson(data as KanjiLesson); 
  };
    
    
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && fetchRef.current) {
      return; // Already fetched, do nothing on the second mount
    }

    const initPage = async () => {
      if (!kuId) return;
      setIsLoading(true);

      try {
        // 1. Fetch KU Identity First (Shared)
        // (Ideally use your new backend GET /knowledge-units/:id here)
        const kuRes = await fetch(`/api/knowledge-units/${kuId}`);
        if (!kuRes.ok) throw new Error("KU not found");
        
        const kuData = await kuRes.json() as KnowledgeUnit;
        setKu(kuData);

        // 2. Branch Logic
        if (kuData.type === 'Vocab') {
          await fetchVocabLesson(kuData); 
        } else if (kuData.type === 'Kanji') {
          await fetchKanjiLesson(kuData);
        }

      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    initPage();
    if (process.env.NODE_ENV === "development") fetchRef.current = true;
  }, [kuId]);

  /*
   * By passing a function to setSelectedFacets, you're telling React: "I don't know what the state is right now.
   * When you're ready to update, please run this function, and give me the guaranteed most recent state, which I will call prev."
   */
  const handleCheckboxChange = (facetKey: string) => {
    // Here we replace selectedFacets with a function that can be called by React at render time to get the actual state (which may have changed)
    setSelectedFacets((prev) => ({
      // recreate the state we passed in with the boolean value of `facetKey` flipped
      ...prev,
      [facetKey]: !prev[facetKey],
    }));
  };

  const handleSubmitFacets = async () => {
    if (!ku || !lesson) return;
    setIsSubmitting(true);
    setError(null);

    const selectedFacetKeys = Object.keys(selectedFacets).filter(
      (key) => selectedFacets[key],
    );

    console.log(`facets = ${selectedFacets}`);

    if (selectedFacetKeys.length === 0) {
      setError("Please select at least one facet to learn.");
      setIsSubmitting(false);
      return;
    }
    console.log(`selectedFacetKeys = ${selectedFacetKeys}, type = ${lesson.type}`);
    const facetsToCreatePayload = selectedFacetKeys.map((key) => {
      if (key.startsWith("Kanji-Component-") && lesson.type === "Vocab") {
        const kanjiChar = key.split("-")[2]; // gets us the Kanji char. Example: Kanji-Component-食
        const kanjiData = (lesson as VocabLesson).component_kanji?.find(
          (k) => k.kanji === kanjiChar,
        );
        return {
          key: key,
          data: {
            meaning: kanjiData?.meaning,
            onyomi: kanjiData?.onyomi,
            kunyomi: kanjiData?.kunyomi,
          },
        };
      }
      return { key: key };
    });
    

    try {
      console.log(`facetsToCreatePayload = ${JSON.stringify(facetsToCreatePayload)}`);
      const response = await fetch("/api/reviews/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kuId: ku.id,
          facetsToCreate: facetsToCreatePayload,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create facets");
      }

      // --- New: Dispatch event to refresh header stats ---
      window.dispatchEvent(new CustomEvent("refreshStats"));
      // --- End New ---

      router.push("/learn");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // In LearnItemPage component...

  const handleSaveSection = async (sectionKey: string, newContent: string) => {
    if (!ku) return;

    try {
      const response = await fetch(`/api/lessons/${ku.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: sectionKey, content: newContent }),
      });

      if (!response.ok) throw new Error("Failed to save section");

      // --- Success ---
      // Update the local 'lesson' state to reflect the change instantly
      setLesson((prevLesson) => ({
        ...prevLesson!,
        [sectionKey]: newContent, // Just update the string field
      }));
    } catch (err: any) {
      setError(err.message);
    }
  };


  const renderFacetChecklist = () => (
    <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
        Choose What to Learn
      </h2>
      <div className="space-y-4">
        {lesson?.type === "Vocab" && (
          <>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets["Definition-to-Content"]} // the !! makes sure that the evaluation is boolean and not undefined or null
                onChange={() => handleCheckboxChange("Definition-to-Content")}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">
                Content
              </span>
            </label>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets["Content-to-Definition"]} // the !! makes sure that the evaluation is boolean and not undefined or null
                onChange={() => handleCheckboxChange("Content-to-Definition")}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">
                Meaning
              </span>
            </label>
            {ku?.data.reading !== ku?.content && (
              <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  checked={!!selectedFacets["Content-to-Reading"]}
                  onChange={() => handleCheckboxChange("Content-to-Reading")}
                />
                <span className="ml-3 text-lg text-gray-900 dark:text-white">
                  Reading
                </span>
              </label>
            )}

            {/* --- REFACTOR: Conditional Component Kanji Display --- */}
            {lesson.component_kanji &&
              lesson.component_kanji.map((kanji, index) => {
                const status = kanjiStatuses[kanji.kanji];
                return (
                  <div
                    key={`${kanji.kanji}-${index}`}
                    className="p-4 bg-gray-300 dark:bg-gray-800 rounded-md"
                  >
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Component Kanji
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-3">
                      The kanji is{" "}
                      <span className="font-bold text-lg">{kanji.kanji}</span>,
                      which generally means "{kanji.meaning}".
                    </p>

                    {status ? (
                      <div className="p-2 bg-gray-400 dark:bg-gray-700 rounded-md">
                        <p className="text-lg text-gray-800 dark:text-gray-200">
                          {status === "learning"
                            ? `You already have a lesson queued for ${kanji.kanji}.`
                            : `You are already learning ${kanji.kanji}.`}
                        </p>
                      </div>
                    ) : (
                      <>
                        <p className="text-gray-600 dark:text-gray-400 mb-3">
                          In this word, it uses the reading{" "}
                          <span className="font-bold text-lg">
                            {kanji.reading}
                          </span>
                          .
                        </p>
                        <label className="flex items-center p-2 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded bg-gray-400 dark:bg-gray-900 border-gray-500 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            checked={
                              !!selectedFacets[`Kanji-Component-${kanji.kanji}`]
                            }
                            onChange={() =>
                              handleCheckboxChange(
                                `Kanji-Component-${kanji.kanji}`,
                              )
                            }
                          />
                          <span className="ml-3 text-lg text-gray-900 dark:text-white">
                            Add {kanji.kanji}
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                );
              })}
            {/* --- END REFACTOR --- */}
          </>
        )}

        {lesson?.type === "Kanji" && (
          <>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets["Kanji-Component-Meaning"]}
                onChange={() => handleCheckboxChange("Kanji-Component-Meaning")}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">
                Meaning (Kanji {"->"} Meaning)
              </span>
            </label>
            <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                checked={!!selectedFacets["Kanji-Component-Reading"]}
                onChange={() => handleCheckboxChange("Kanji-Component-Reading")}
              />
              <span className="ml-3 text-lg text-gray-900 dark:text-white">
                Reading (Kanji {"->"} On/Kun)
              </span>
            </label>
          </>
        )}

        <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
          <input
            type="checkbox"
            className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            checked={!!selectedFacets["AI-Generated-Question"]}
            onChange={() => handleCheckboxChange("AI-Generated-Question")}
          />
          <span className="ml-3 text-lg text-gray-900 dark:text-white">
            AI-Generated Quiz Questions
          </span>
        </label>
      </div>

      <button
        onClick={handleSubmitFacets}
        disabled={isSubmitting || !lesson}
        className="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-wait"
      >
        {isSubmitting ? "Saving..." : "Start Learning Selected Facets"}
      </button>
    </div>
  );

  // Used to determine if the call to this page came from the review facet
  const searchParams = useSearchParams();
  const source = searchParams.get("source");

  // --- Main Render ---
  return (
    <>
      <main className="container mx-auto max-w-4xl p-8">
        <header className="mb-8">
          <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-2 break-all">
            {isLoading
              ? "..."
              : lesson?.type === "Kanji" && (lesson as KanjiLesson).kanji
                ? (lesson as KanjiLesson).kanji
                : ku?.content || "..."}
          </h1>
          {lesson && lesson?.type === "Vocab" && (
            <p className="text-2xl text-gray-500 dark:text-gray-400 capitalize">
              {lesson?.partOfSpeech
                ? lesson.partOfSpeech
                : ku
                  ? ku.type
                  : "..."}{" "}
            </p>
          )}
        </header>

        {isLoading && (
          <p className="text-xl text-center text-gray-500 dark:text-gray-400">
            Loading lesson...
          </p>
        )}
        {error && (
          <div className="bg-red-200 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-800 dark:text-red-100 p-4 rounded-md mb-6">
            {error}
          </div>
        )}

        {lesson &&
          ku?.type === "Vocab" &&
          (
            <VocabLessonView 
                lesson={lesson as VocabLesson} 
                onSaveSection={handleSaveSection} 
            />
          )
        }
        
        {lesson &&
          ku?.type === "Kanji" &&
          (
            <KanjiLessonView lesson={lesson as KanjiLesson} />
          )
        }

        {!isLoading && !error && lesson && source !== "review" && (
          <>
            {renderFacetChecklist()}
          </>
        )}
      </main>
    </>
  );
}
