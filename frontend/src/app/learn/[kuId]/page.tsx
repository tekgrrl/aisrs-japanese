"use client";

import React, { useState, useEffect, useRef } from "react"; // <-- Import useRef
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { KnowledgeUnit, Lesson, VocabLesson, KanjiLesson, GrammarLesson, UserGrammarLesson } from "@/types";
import VocabLessonView from "@/components/lessons/VocabLessonView";
import KanjiLessonView from "@/components/lessons/KanjiLessonView";
import GrammarLessonView from "@/components/lessons/GrammarLessonView";
import { apiFetch } from "@/lib/api-client";

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
  const [userGrammarLessons, setUserGrammarLessons] = useState<UserGrammarLesson[]>([]);

  const fetchVocabLesson = async (ku: KnowledgeUnit) => {
    setIsLoading(true);
    setError(null);
    setKu(null);
    setLesson(null);
    setKanjiStatuses({});

    try {
      // Most recent change here. Something broke
      const kuResponse = await apiFetch(`/api/knowledge-units/${kuId}`);

      if (!kuResponse.ok) {
        if (kuResponse.status === 404) {
          setError("Learning item not found.");
          return;
        }
        throw new Error("Failed to fetch Knowledge Unit");
      }

      const kuData = (await kuResponse.json()) as KnowledgeUnit;
      setKu(kuData);

      // 2. Fetch the Lesson for this kuDoc by kuDoc.id
      const lessonResponse = await apiFetch("/api/lessons/generate", {
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
        const response = await apiFetch(
          "/api/knowledge-units/get-all?status=learning&content=" +
            kanjiChars.join(","),
        );

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
    const response = await apiFetch(
      `/api/kanji/details?char=${encodeURIComponent(ku.content)}&kuId=${ku.id}`,
    );

    if (!response.ok) throw new Error("Failed to fetch Kanji details");

    const data = await response.json();
    console.log(`data = ${JSON.stringify(data)}`);
    setLesson(data as KanjiLesson);
  };

  const fetchGrammarLesson = async (ku: KnowledgeUnit) => {
    const [lessonRes, userLessonsRes] = await Promise.all([
      apiFetch("/api/lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kuId: ku.id }),
      }),
      apiFetch(`/api/lessons/user-grammar?kuId=${ku.id}`),
    ]);

    if (!lessonRes.ok) throw new Error("Failed to generate grammar lesson");
    const lessonData = (await lessonRes.json()) as GrammarLesson;
    setLesson(lessonData);

    if (userLessonsRes.ok) {
      const ugls = (await userLessonsRes.json()) as UserGrammarLesson[];
      setUserGrammarLessons(ugls);
    }
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
        const kuRes = await apiFetch(`/api/knowledge-units/${kuId}`);
        if (!kuRes.ok) throw new Error("KU not found");

        const kuData = (await kuRes.json()) as KnowledgeUnit;
        setKu(kuData);

        // 2. Branch Logic
        if (kuData.type === "Vocab") {
          await fetchVocabLesson(kuData);
        } else if (kuData.type === "Kanji") {
          await fetchKanjiLesson(kuData);
        } else if (kuData.type === "Grammar") {
          await fetchGrammarLesson(kuData);
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

    if (selectedFacetKeys.length === 0) {
      setError("Please select at least one facet to learn.");
      setIsSubmitting(false);
      return;
    }

    const contextExampleKeys = selectedFacetKeys.filter((key) =>
      key.startsWith("Context-Example-"),
    );
    const reviewFacetKeys = selectedFacetKeys.filter(
      (key) => !key.startsWith("Context-Example-"),
    );

    const promises: Promise<any>[] = [];

    // 1. Process Context Example Scenarios
    if (contextExampleKeys.length > 0 && lesson.type === "Vocab") {
      const vocabLesson = lesson as VocabLesson;
      contextExampleKeys.forEach((key) => {
        const indexStr = key.replace("Context-Example-", "");
        const index = parseInt(indexStr, 10);
        const ex = vocabLesson.context_examples?.[index];

        if (ex) {
          const p = apiFetch("/api/scenarios/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              difficulty: "N4", // Default baseline for context examples
              theme: "Practice vocabulary in context",
              sourceType: "context-example",
              sourceContextSentence: ex.sentence,
              targetVocab: ku.content,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Failed to generate scenario");
            }
          });
          promises.push(p);
        }
      });
    }

    // 2a. Grammar facets (handled separately — may emit multiple sentence-assembly facets)
    if (ku?.type === "Grammar" && lesson?.type === "Grammar") {
      const grammarLesson = lesson as GrammarLesson;
      const grammarFacets: { key: string; data: Record<string, any> }[] = [];

      if (selectedFacets["sentence-assembly"]) {
        grammarLesson.examples.forEach((ex) => {
          grammarFacets.push({
            key: "sentence-assembly",
            data: {
              goalTitle: grammarLesson.pattern,
              fragments: ex.fragments,
              answer: ex.japanese,
              english: ex.english,
              accepted_alternatives: ex.accepted_alternatives ?? [],
              sourceId: ku.id,
              sourceTitle: grammarLesson.title,
            },
          });
        });
      }
      if (selectedFacets["AI-Generated-Question"]) {
        grammarFacets.push({
          key: "AI-Generated-Question",
          data: {
            content: grammarLesson.pattern,
            topic: grammarLesson.title,
            sourceId: ku.id,
            sourceTitle: grammarLesson.title,
          },
        });
      }
      if (selectedFacets["Content-to-Definition"]) {
        grammarFacets.push({
          key: "Content-to-Definition",
          data: {
            content: grammarLesson.pattern,
            definitions: [grammarLesson.meaning],
            topic: grammarLesson.title,
          },
        });
      }

      if (grammarFacets.length > 0) {
        promises.push(
          apiFetch("/api/reviews/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kuId: ku.id, facetsToCreate: grammarFacets }),
          }).then(async (res) => {
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Failed to create grammar facets");
            }
          }),
        );
      }
    }

    // 2. Process Standard Review Facets
    if (reviewFacetKeys.length > 0) {
      const facetsToCreatePayload = reviewFacetKeys.map((key) => {
        // Component kanji stub creation (Kanji-Component-食 etc.) — no facet created, just KU stub
        if (key.startsWith("Kanji-Component-") &&
            key !== "Kanji-Component-Meaning" &&
            key !== "Kanji-Component-Reading" &&
            lesson.type === "Vocab") {
          const kanjiChar = key.split("-")[2];
          const kanjiData = (lesson as VocabLesson).component_kanji?.find(
            (k) => k.kanji === kanjiChar,
          );
          return {
            key,
            data: {
              meaning: kanjiData?.meaning,
              onyomi: kanjiData?.onyomi,
              kunyomi: kanjiData?.kunyomi,
            },
          };
        }
        // Standalone kanji facets (from Kanji lesson page)
        if (key === "Kanji-Component-Meaning" || key === "Kanji-Component-Reading") {
          const kanjiLesson = lesson as KanjiLesson;
          return {
            key,
            data: {
              content: ku.content,
              meaning: kanjiLesson.meaning,
              onyomi: kanjiLesson.onyomi,
              kunyomi: kanjiLesson.kunyomi,
            },
          };
        }
        // Audio facet
        if (key === "audio" && lesson.type === "Vocab") {
          const vocabLesson = lesson as VocabLesson;
          const ex = vocabLesson.context_examples && vocabLesson.context_examples.length > 0
            ? vocabLesson.context_examples[Math.floor(Math.random() * vocabLesson.context_examples.length)]
            : null;
          return {
            key,
            data: {
              content: ku.content,
              reading: vocabLesson.reading || (ku.type === 'Vocab' ? ku.data.reading : undefined),
              definitions: vocabLesson.definitions ?? [],
              ...(ex ? { contextExample: ex } : {}),
            },
          };
        }
        // All other facets: Content-to-Definition, Definition-to-Content,
        // Content-to-Reading, Reading-to-Content, AI-Generated-Question
        const vocabLesson = lesson.type === "Vocab" ? (lesson as VocabLesson) : null;
        return {
          key,
          data: {
            content: ku.content,
            reading: vocabLesson?.reading || (ku.type === 'Vocab' ? ku.data.reading : undefined),
            definitions: vocabLesson?.definitions ?? [],
            topic: ku.content,
          },
        };
      });

      const reviewPromise = apiFetch("/api/reviews/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kuId: ku.id,
          facetsToCreate: facetsToCreatePayload,
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create facets");
        }
      });
      promises.push(reviewPromise);
    }

    try {
      await Promise.all(promises);

      window.dispatchEvent(new CustomEvent("refreshStats"));
      router.push("/learn");
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // In LearnItemPage component...

  const handleSaveSection = async (sectionKey: string, newContent: string) => {
    if (!ku) return;

    try {
      const response = await apiFetch(`/api/lessons/${ku.id}`, {
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
            {ku?.type === 'Vocab' && ku.data.reading !== ku?.content && (
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

            {lesson.type === "Vocab" && (lesson as VocabLesson).context_examples && (lesson as VocabLesson).context_examples!.length > 0 && (
              <label className="flex items-center p-4 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded bg-gray-300 dark:bg-gray-900 border-gray-400 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  checked={!!selectedFacets["audio"]}
                  onChange={() => handleCheckboxChange("audio")}
                />
                <span className="ml-3 text-lg text-gray-900 dark:text-white">
                  Audio Comprehension
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

            {/* --- Context Example Scenarios --- */}
            {lesson.type === "Vocab" && (lesson as VocabLesson).context_examples && ((lesson as VocabLesson).context_examples?.length || 0) > 0 && (
              <div className="p-4 bg-gray-300 dark:bg-gray-800 rounded-md">
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Context Example Scenarios
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-3 block">
                  Select examples to instantly architect roleplay scenarios where you must use the word <strong>{ku?.content}</strong> in context.
                </p>
                <div className="space-y-3">
                  {(lesson as VocabLesson).context_examples?.map((ex, index) => (
                    <label key={index} className="flex items-start p-3 rounded-md hover:bg-gray-400 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 rounded bg-gray-400 dark:bg-gray-900 border-gray-500 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                        checked={!!selectedFacets[`Context-Example-${index}`]}
                        onChange={() => handleCheckboxChange(`Context-Example-${index}`)}
                      />
                      <span className="ml-3 text-lg text-gray-900 dark:text-white flex flex-col">
                        <span>{ex.sentence}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">{ex.translation}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {/* --- End Context Example Scenarios --- */}
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
            AI-Generated Questions
          </span>
        </label>
      </div>

      <button
        onClick={handleSubmitFacets}
        disabled={isSubmitting || !lesson}
        className="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-wait"
      >
        {isSubmitting ? "Saving..." : "Start Learning Selected Items"}
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
                : lesson?.type === "Grammar"
                  ? (lesson as GrammarLesson).pattern
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
          {lesson && lesson?.type === "Grammar" && (
            <p className="text-2xl text-gray-500 dark:text-gray-400">
              Grammar Pattern
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

        {lesson && ku?.type === "Vocab" && (
          <VocabLessonView
            lesson={lesson as VocabLesson}
            onSaveSection={handleSaveSection}
          />
        )}

        {lesson && ku?.type === "Kanji" && (
          <KanjiLessonView lesson={lesson as KanjiLesson} />
        )}

        {lesson && ku?.type === "Grammar" && (
          <GrammarLessonView
            lesson={lesson as GrammarLesson}
            userLesson={userGrammarLessons[0]}
            selectedFacets={selectedFacets}
            onToggleFacet={handleCheckboxChange}
          />
        )}

        {!isLoading && !error && lesson && source !== "review" && ku?.type !== "Grammar" && (
          <>
            {renderFacetChecklist()}
          </>
        )}

        {!isLoading && !error && lesson && source !== "review" && ku?.type === "Grammar" && (
          <div className="mt-6">
            {error && (
              <div className="mb-4 text-red-600 text-sm">{error}</div>
            )}
            <button
              onClick={handleSubmitFacets}
              disabled={isSubmitting || !lesson}
              className="w-full py-4 text-lg bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Saving..." : "Start Learning Selected Items"}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
