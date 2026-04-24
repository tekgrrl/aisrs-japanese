/**
 * Prompts for answer and scenario evaluation.
 * Sources: backend/src/reviews/reviews.service.ts, backend/src/gemini/gemini.service.ts
 */

// ---------------------------------------------------------------------------
// Answer evaluator
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt for evaluating a user's answer against expected answers.
 * Source: reviews.service.ts:evaluateAnswer
 *
 * Note: userAnswer and expectedAnswers are also passed separately as the user message
 * by GeminiService.evaluateAnswer — they appear here for full context framing.
 */
export function buildAnswerEvaluatorPrompt(
  question: string | undefined,
  topic: string | undefined,
  expectedAnswers: string[],
  userAnswer: string,
): string {
  return `You are a Japanese Language Learning evaluator. A user is being quizzed.
- The question was: "${question || 'N/A'}"
- The topic was: "${topic || 'N/A'}"
- The expected answer(s) are: "${JSON.stringify(expectedAnswers)}"
- The user's answer is: "${userAnswer}"

Your task is to evaluate if the user's answer is correct.
1.  Read the "expected answer(s)". This may be a single answer (e.g., "Family") or a comma-separated list of possible correct answers (e.g., "ドク, トク, よむ").
2.  Compare the user's answer to the list. The user is correct if their answer is *any one* of the items in the list.
3.  If you feel that the answer is correct but not in the list, return a pass with an explanation.
4.  Be lenient with hiragana vs katakana (e.g., if expected is "ドク" and user typed "どく", it's a pass).
5.  Be lenient with extra punctuation or whitespace.
6.  Provide your evaluation ONLY as a valid JSON object with the following schema:
{
  "result": "pass" | "fail",
  "explanation": "A brief, one-sentence explanation for *why* the user passed or failed, referencing their answer."
}
Example for a pass: {"result": "pass", "explanation": "Correct! よむ is one of the kun'yomi readings."}
Example for a fail: {"result": "fail", "explanation": "Incorrect. The expected readings were ドク, トク, or よむ."}
`;
}

// ---------------------------------------------------------------------------
// Scenario evaluator
// ---------------------------------------------------------------------------

export type ScenarioEvalContext = {
  title: string;
  goal: string;
  difficulty: string;
  userRole?: string;
  aiRole?: string;
  isObjectiveMet: boolean;
};

/**
 * Builds the full evaluation prompt for a completed roleplay scenario.
 * Includes history formatting logic (previously inline in GeminiService.evaluateScenario).
 * Source: gemini.service.ts:evaluateScenario
 */
export function buildScenarioEvaluatorPrompt(
  chatHistory: { speaker: string; text: string }[],
  context: ScenarioEvalContext,
): string {
  const historyText = chatHistory.map((m) => {
    const isUser = m.speaker === 'user';
    const roleName = isUser ? context.userRole : context.aiRole;
    return `[${isUser ? 'User' : 'AI'} - ${roleName}]: ${m.text}`;
  }).join('\n');

  return `
        Act as a strict Japanese language teacher.
        Evaluate this Roleplay Session based on:
        1. Did they achieve the Goal? (success: true/false): (${context.goal})
        2. Grammar/Vocabulary Usage (Level ${context.difficulty})
        3. Rate naturalness (1-5).
        4. Provide specific feedback in English.
        5. Identify 1-3 critical mistakes.

        SCENARIO CONTEXT:
        - Title: ${context.title}
        - Goal: ${context.goal}
        - User Role: ${context.userRole || 'User'} (The person being evaluated)
        - AI Role: ${context.aiRole || 'AI'} (The conversation partner)
        - OBJECTIVE MET: ${context.isObjectiveMet}

        TRANSCRIPT:
        ${historyText}

        **CRITICAL GRADING RULES:**
        1. **Output Language:** Write the 'feedback' and 'explanation' fields in **ENGLISH ONLY**. Do not use Japanese for the report text.
        2. **Failure Condition:** If 'OBJECTIVE MET' is 'NO', the 'success' field MUST be false, and the 'rating' MUST be 1 or 2 (Fail). Do not give high ratings for incomplete work.
        3. **Success Condition:** If 'OBJECTIVE MET' is 'YES', grade based on naturalness and grammar.
        4. **Ignore Punctuation:** the user input is a speech transcript. Do NOT critique missing commas, periods, or quotation marks. Focus ONLY on word choice, grammar, and natural flow.

        INSTRUCTION: Evaluate the USER (${context.userRole || 'User'}) based on how well they achieved the goal. Do not confuse the User's responses with the AI's responses.
        OUTPUT LANGUAGE: the feedback and explanation must be in English. Do not write the report in Japanese but do not translate the user's or AI's responses.

        Provide a structured evaluation in JSON using the attached schema.
      `;
}
