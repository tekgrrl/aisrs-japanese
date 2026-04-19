import { Injectable, Inject, Logger, forwardRef, NotFoundException, BadRequestException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import {
  FIRESTORE_CONNECTION,
  QUESTIONS_COLLECTION,
  QUESTION_STATES_SUBCOLLECTION,
  Timestamp,
  FieldValue,
} from '../firebase/firebase.module';
import { ReviewFacet, QuestionItem, UserQuestionState } from '@/types';
import { GeminiService } from '../gemini/gemini.service';
import { ReviewsService } from '../reviews/reviews.service';
import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';

const SUITABLE_RANK_THRESHOLD = 30;
const RANK_CORRECT_DELTA = 5;
const RANK_KEEP_DELTA = 5;
const RANK_REPORT_DELTA = -25;
const MAX_CONSECUTIVE_FAILURES = 3;

type QuestionResponse = {
  question: string;
  context: string | undefined;
  answer: string;
  accepted_alternatives: string[] | undefined;
  questionId: string;
  isNew: boolean;
};

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly geminiService: GeminiService,
    @Inject(forwardRef(() => ReviewsService))
    private readonly reviewsService: ReviewsService,
    private readonly knowledgeUnitsService: KnowledgeUnitsService,
  ) {}

  private questionStatesRef(uid: string) {
    return this.db.collection('users').doc(uid).collection(QUESTION_STATES_SUBCOLLECTION);
  }

  private toResponse(question: QuestionItem, isNew: boolean): QuestionResponse {
    return {
      question: question.data.question,
      context: question.data.context,
      answer: question.data.answer,
      accepted_alternatives: question.data.acceptedAlternatives,
      questionId: question.id,
      isNew,
    };
  }

  async testConnection() {
    const snapshot = await this.db.collection(QUESTIONS_COLLECTION).limit(1).get();
    this.logger.log(`Found ${snapshot.size} questions`);
  }

  async selectQuestion(uid: string, kuId: string, facetId: string, topic: string): Promise<QuestionResponse> {
    if (!topic) throw new BadRequestException('Topic is required');

    const facetData = facetId
      ? await this.reviewsService.getByFacetId(uid, facetId) as ReviewFacet | null
      : null;

    // 1. Try to reuse the question already on the facet
    if (facetData?.currentQuestionId) {
      const reused = await this.tryReuseQuestion(uid, facetData.currentQuestionId);
      if (reused) {
        this.logger.log(`Reusing question ${facetData.currentQuestionId} for facet ${facetId}`);
        return reused;
      }
    }

    // 2. Find another suitable question from the global corpus
    const suitable = await this.findSuitableQuestion(uid, kuId, facetData?.currentQuestionId);
    if (suitable) {
      this.logger.log(`Found suitable question ${suitable.questionId} for KU ${kuId}`);
      if (facetId) await this.reviewsService.updateFacetQuestion(uid, facetId, suitable.questionId);
      return suitable;
    }

    // 3. Generate a new question via AI
    this.logger.log(`No suitable questions for KU ${kuId} — generating new one`);
    return this.generateAndSave(uid, topic, kuId, facetId);
  }

  private async tryReuseQuestion(uid: string, questionId: string): Promise<QuestionResponse | null> {
    const [questionDoc, stateDoc] = await Promise.all([
      this.db.collection(QUESTIONS_COLLECTION).doc(questionId).get(),
      this.questionStatesRef(uid).doc(questionId).get(),
    ]);

    if (!questionDoc.exists) return null;

    const question = { id: questionDoc.id, ...questionDoc.data() } as QuestionItem;
    const state = stateDoc.exists ? stateDoc.data() as UserQuestionState : null;

    const rank = question.rank ?? 50;
    if (
      !state?.rejected &&
      rank >= SUITABLE_RANK_THRESHOLD &&
      (state?.consecutiveFailures ?? 0) < MAX_CONSECUTIVE_FAILURES
    ) {
      return this.toResponse(question, !stateDoc.exists);
    }

    return null;
  }

  private async findSuitableQuestion(uid: string, kuId: string, excludeId?: string): Promise<QuestionResponse | null> {
    const snapshot = await this.db.collection(QUESTIONS_COLLECTION)
      .where('kuId', '==', kuId)
      .get();

    if (snapshot.empty) return null;

    const candidates = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as QuestionItem))
      .filter(q => q.id !== excludeId && (q.rank ?? 50) >= SUITABLE_RANK_THRESHOLD);

    if (candidates.length === 0) return null;

    const stateDocs = await Promise.all(
      candidates.map(q => this.questionStatesRef(uid).doc(q.id).get())
    );

    for (let i = 0; i < candidates.length; i++) {
      const question = candidates[i];
      const stateDoc = stateDocs[i];
      const state = stateDoc.exists ? stateDoc.data() as UserQuestionState : null;

      if (state?.rejected) continue;
      if ((state?.consecutiveFailures ?? 0) >= MAX_CONSECUTIVE_FAILURES) continue;

      return this.toResponse(question, !stateDoc.exists);
    }

    return null;
  }

  private async generateAndSave(uid: string, topic: string, kuId: string, facetId?: string): Promise<QuestionResponse> {
    const questionOptions = {
      "conjugation": "if the word is a verb, conjugate the verb to a specific form e.g.: Give the past potential form of the verb in question",
      "particle": "Match up the Vocab in question with a particle to give a particular meaning in a sentence that you specify, you can represent the particle with a blank '[____]'",
      "translation": "Create a sentence in English for the user to translate into Japanese. The English sentence must naturally force the use of the Target Input.",
      "fill-in-the-blank": "A context-based, fill-in-the-blank style question with a single blank '[____]'",
    };
    const questionOptionTypes = Object.keys(questionOptions);
    const selectedType = questionOptionTypes[Math.floor(Math.random() * questionOptionTypes.length)];

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

    let reading: string | undefined;
    let meaning: string | undefined;
    if (kuId) {
      const kuData = await this.knowledgeUnitsService.findOne(kuId);
      if (kuData.type === 'Vocab') {
        reading = kuData.data.reading;
        meaning = kuData.data.definition;
      } else if (kuData.type === 'Kanji') {
        meaning = kuData.data.meaning;
      }
    }

    let userMessage = `Topic: ${topic}`;
    if (reading) userMessage += `\nReading: ${reading}`;
    if (meaning) userMessage += `\nMeaning: ${meaning}`;

    const questionString = await this.geminiService.generateQuestionAI(userMessage, systemPrompt, {});

    if (!questionString) throw new Error('AI response was empty.');

    let parsed: { question: string; answer: string; context?: string; accepted_alternatives?: string[] };
    try {
      parsed = JSON.parse(questionString);
    } catch {
      throw new Error('Failed to parse AI JSON response');
    }

    const ref = this.db.collection(QUESTIONS_COLLECTION).doc();
    const newQuestion: QuestionItem = {
      id: ref.id,
      kuId,
      data: {
        question: parsed.question,
        context: parsed.context,
        answer: parsed.answer,
        acceptedAlternatives: parsed.accepted_alternatives,
        difficulty: 'JLPT-N5',
      },
      rank: 50,
      rejectionCount: 0,
      createdAt: Timestamp.now(),
    };

    await ref.set(newQuestion);
    this.logger.log(`Saved new question ${ref.id} for KU ${kuId}`);

    if (facetId) {
      await this.reviewsService.updateFacetQuestion(uid, facetId, ref.id);
    }

    return this.toResponse(newQuestion, true);
  }

  async recordAnswer(uid: string, questionId: string, kuId: string, result: 'pass' | 'fail') {
    const questionRef = this.db.collection(QUESTIONS_COLLECTION).doc(questionId);
    const stateRef = this.questionStatesRef(uid).doc(questionId);

    const batch = this.db.batch();

    if (result === 'pass') {
      batch.update(questionRef, { rank: FieldValue.increment(RANK_CORRECT_DELTA) });
      batch.set(stateRef, { questionId, kuId, consecutiveFailures: 0 }, { merge: true });
    } else {
      batch.set(stateRef, { questionId, kuId, consecutiveFailures: FieldValue.increment(1) }, { merge: true });
    }

    try {
      await batch.commit();
    } catch (err) {
      this.logger.error(`Failed to record answer for question ${questionId}`, err);
    }
  }

  async recordFeedback(uid: string, questionId: string, feedback: 'keep' | 'request-new' | 'report') {
    const questionRef = this.db.collection(QUESTIONS_COLLECTION).doc(questionId);
    const doc = await questionRef.get();

    if (!doc.exists) throw new NotFoundException('Question not found');

    const stateRef = this.questionStatesRef(uid).doc(questionId);
    const batch = this.db.batch();

    switch (feedback) {
      case 'keep':
        batch.update(questionRef, { rank: FieldValue.increment(RANK_KEEP_DELTA) });
        break;
      case 'request-new':
        batch.update(questionRef, { rejectionCount: FieldValue.increment(1) });
        batch.set(stateRef, { rejected: true }, { merge: true });
        break;
      case 'report':
        batch.update(questionRef, { rank: FieldValue.increment(RANK_REPORT_DELTA) });
        break;
    }

    await batch.commit();
    this.logger.log(`Recorded feedback '${feedback}' for question ${questionId}`);
    return { questionId, feedback };
  }
}
