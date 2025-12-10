import { Injectable, Inject, Logger, forwardRef, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import {
  FIRESTORE_CONNECTION,
  QUESTIONS_COLLECTION,
  REVIEW_FACETS_COLLECTION,
  Timestamp,
  FieldValue,
} from '../firebase/firebase.module';
import { BadRequestException } from '@nestjs/common';
import { ReviewFacet, QuestionItem, KnowledgeUnit } from '@/types';
import { GeminiService } from '../gemini/gemini.service';
import { ReviewsService } from '../reviews/reviews.service';
import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';
import { CURRENT_USER_ID } from '@/lib/constants';



@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => ReviewsService))
    private readonly reviewsService: ReviewsService,
    private readonly knowledgeUnitsService: KnowledgeUnitsService,

  ) { }

  async testConnection() {
    const snapshot = await this.db.collection(QUESTIONS_COLLECTION).limit(1).get();
    this.logger.log(`Found ${snapshot.size} questions`);
  }


  async updateQuestionHistory(questionId: string, userAnswer: string, result: string) {
    if (questionId) {
      try {
        const questionRef = this.db
          .collection(QUESTIONS_COLLECTION)
          .doc(questionId);
        await questionRef.update({
          previousAnswers: FieldValue.arrayUnion({
            answer: userAnswer,
            result: "pass",
            timestamp: Timestamp.now(),
          }),
        });
        this.logger.log(`Updated question ${questionId} with pass history`);
      } catch (histError) {
        this.logger.error(
          "Failed to update question history (local pass)",
          histError,
        );
      }
    }
  }

  async generateQuestion(topic: string, kuId: string, facetId: string) {

    const questionOptions = {
      "conjugation": "if the word is a verb, conjugate the verb to a specific form e.g.: Give the past potential form of the verb in question",
      "particle": "Match up the Vocab in question with a particle to give a particular meaning in a sentence that you specify, you can represent the particle with a blank '[____]'",
      "translation": "Create a sentence in English for the user to translate into Japanese. The English sentence must naturally force the use of the Target Input.",
      "fill-in-the-blank": "A context-based, fill-in-the-blank style question with a single blank '[____]'"
    }

    const questionOptionTypes = Object.keys(questionOptions);
    const selectedType = questionOptionTypes[Math.floor(Math.random() * questionOptionTypes.length)];

    // --- System Prompt ---
    const systemPrompt = `You are an expert Japanese tutor and quiz generator. 
You will be prompted with a single piece of Japanese Vocab: a word or grammar concept (the 'topic') and an optional reading and meaning. 
Your task is to create a single, context-based question to test the user's understanding of that word or grammar concept.
If a reading and/or meaning are provided, you MUST generate a question where the topic matches those specific constraints. Do not generate questions for alternative readings or meanings of the same word.
You MUST generate a question using the following form:
${questionOptions[selectedType]};

You MUST return ONLY a valid JSON object with the following schema:
{
  "question": "The actual question that will be displayed to the user.",
  "context": "OPTIONAL. Brief English context/hint only if needed for disambiguation.",
  "answer": "The primary answer to the question.",
  "accepted_alternatives": ["Array of other grammatically valid answers (e.g. different politeness levels)."]
}
Rules:
1.  The question must directly test the provided 'topic'.
2.  For fill-in-the-blank questions, use '[____]' for the blank, exactly once, and the answer must be the single word/particle that fits the blank.
3.  Do not use Romaji to indicate the reading of whatever is being tested. Do not use Romaji at all.
4.  The context field MUST be used for any "fill-in-the-blank" question that tests a noun or adjective, as these are often ambiguous. The context MUST provide a hint to differentiate the answer from common synonyms. (e.g., for 気分, a hint like (Context: a person's mood or feeling) is required).
5.  Ensure the generated question and any accepted answers make grammatical sense.
6.  Do NOT use literal newlines inside the JSON string values. Use spaces instead.
7.  If the provided English context does NOT strictly dictate a specific politeness level, you MUST include standard valid variations (plain form, polite 'masu' form) in the accepted_alternatives array.
8.  Use simple, standard grammar and vocabulary (equivalent to JLPT N4) for the surrounding sentence structure. Ensure the sentence is easy to read, so the user focuses on the target blank, not on deciphering the rest of the sentence.
9.  Relative Complexity Rule: The surrounding sentence MUST NOT be more difficult than the target word. If the target is advanced (N3+), use simple (N4/N5) grammar structure to ensure clarity. For advanced verbs/adjectives, prioritize questions that test conjugation or specific grammatical usage over complex semantic inference.
10. The question tests a specific concept, but natural language often has valid variations based on politeness (e.g., 食べる vs. 食べます).
11. Ambiguity Prevention: If other distinct words (synonyms) could be grammatically correct, use the English context to disambiguate by including the closest English translation/explanation of the target word.
12. If the question requires conjugation of a verb and the answer is not the base form, provide enough context to disambiguate the answer.
13. Do not add any text before or after the JSON object.`;

    let parsedJson: {
      question: string;
      answer: string;
      context?: string;
      accepted_alternatives?: string[];
    } | undefined; // Capture parsed result

    if (!topic) {
      throw new BadRequestException('Topic is required');
    }

    let reading: string | undefined;
    let meaning: string | undefined;
    if (kuId) {
      const kuData = await this.knowledgeUnitsService.findOne(kuId);
      reading = kuData.data?.reading;
      // Use 'meaning' (Kanji) or 'definition' (Vocab) depending on what's available
      meaning = kuData.data?.meaning || kuData.data?.definition;
    }

    // --- Persistence Logic ---
    let facetData: ReviewFacet | undefined;
    let returnedQuestionId: string | null = null;

    if (facetId) {
      facetData = (await this.reviewsService.getByFacetId(facetId)) as ReviewFacet;

      if (facetData) {

        if (
          facetData.currentQuestionId &&
          (facetData.questionAttempts || 0) < 3
        ) {
          this.logger.log(
            `Reusing question ${facetData.currentQuestionId} for facet ${facetId} (attempts: ${facetData.questionAttempts})`,
          );


          const questionDoc = await this.db
            .collection(QUESTIONS_COLLECTION)
            .doc(facetData.currentQuestionId)
            .get();

          if (questionDoc.exists) {
            const questionItem = questionDoc.data() as QuestionItem;

            // Check if the question is active
            if (questionItem.status === "inactive") {
              this.logger.log(`Question ${facetData.currentQuestionId} is inactive. Generating new one.`);
            } else {
              this.logger.log(`Question ${facetData.currentQuestionId} found and active. Returning it.`);
              // Return the stored question data directly
              // We need to map it back to the expected response format
              return {
                question: questionItem.data.question,
                context: questionItem.data.context,
                answer: questionItem.data.answer,
                accepted_alternatives: questionItem.data.acceptedAlternatives,
                questionId: questionItem.id, // Return the ID
              };
            }
          } else {
            this.logger.log(`Question ${facetData.currentQuestionId} not found. Generating new one.`);
          }
        } else {
          this.logger.log(
            `Not reusing question. currentQuestionId: ${facetData.currentQuestionId}, attempts: ${facetData.questionAttempts}`,
          );
        }
      } else {
        this.logger.log`Facet ${facetId} not found`
      }
    }

    const runningListSummary = "No weak points identified yet."; // TODO: re-implement running list

    let userMessage = `Topic: ${topic}`;
    if (reading) userMessage += `\nReading: ${reading}`;
    if (meaning) userMessage += `\nMeaning: ${meaning}`;
    userMessage += `\n`;

    // TODO: What to do about the empty LogContext argument?
    const questionString = await this.geminiService.generateQuestionAI(userMessage, systemPrompt, {});

    // Here we get back the json text from Gemini. We need to check we got something and then parse it
    if (!questionString) {
      this.logger.error("AI response was empty.");
      throw new Error("AI response was empty.");
    }

    // 4. Parse and validate (keeping existing robust parsing logic)
    try {
      parsedJson = JSON.parse(questionString);
    } catch (parseError) {
      this.logger.error("Failed to parse AI JSON response", {
        questionString,
        parseError,
      });
      throw new Error("Failed to parse AI JSON response");
    }

    if (!parsedJson) {
      throw new Error(
        "Evaluation result is missing after AI response parsing.",
      );
    }

    // --- Save Generated Question ---
    if (facetId) {
      try {
        const newQuestionRef = this.db.collection(QUESTIONS_COLLECTION).doc();
        const newQuestionItem: QuestionItem = {
          id: newQuestionRef.id,
          kuId: kuId || topic, // Use kuId if available, fallback to topic
          data: {
            question: parsedJson.question,
            context: parsedJson.context,
            answer: parsedJson.answer,
            acceptedAlternatives: parsedJson.accepted_alternatives,
            difficulty: "JLPT-N5", // TODO Need to get this value from the generate-question response eventually
          },
          createdAt: Timestamp.now(),
          lastUsed: Timestamp.now(),
          userId: CURRENT_USER_ID,
          status: "active", // Default status
        };

        await newQuestionRef.set(newQuestionItem);
        this.logger.log(`Saved new question: ${newQuestionRef.id}`);

        // Update Facet
        await this.reviewsService.updateFacetQuestion(facetId, newQuestionRef.id);
        returnedQuestionId = newQuestionRef.id;
      } catch (saveError) {
        this.logger.error("Failed to save generated question", saveError);
        // Don't fail the request if saving fails, just log it
      }
    }

    return {
      ...parsedJson,
      questionId: returnedQuestionId,
    };

  } // end generateQuestion

  async updateStatus(id: string, status: 'active' | 'flagged' | 'inactive') {
    const docRef = this.db.collection(QUESTIONS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new NotFoundException('Question not found');
    }

    // Ideally check userId here too if questions are user-owned in your model
    // if (doc.data()?.userId !== CURRENT_USER_ID) ...

    await docRef.update({ status });

    this.logger.log(`Updated question ${id} status to ${status}`);
    return { id, status };
  } // end updateStatus
}
