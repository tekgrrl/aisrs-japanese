/**
 * Prompts for scenario generation and roleplay chat.
 * Source: backend/src/scenarios/scenarios.service.ts
 */

import { GenerateScenarioDto, Scenario } from '../types/scenario';
import { FRAGMENT_CONTRACT, ACCEPTED_ALTERNATIVES_DEF } from './fragments';

// ---------------------------------------------------------------------------
// Role allowlists
// (Copied from scenarios.service.ts — Phase 2 will flip the import direction)
// ---------------------------------------------------------------------------

export const ALLOWED_USER_ROLES = [
  'Traveller', 'Customer', 'Guest', 'Student', 'Patient', 'Me', 'Passenger',
  'Software Engineer', 'Pedestrian', 'Diner', 'Driver', 'Japanophile',
  '客', '私', '旅行者', '学生', '患者', '乗客', 'プログラマー', '歩行者', 'ダイナー', 'ドライバー'
];

export const ALLOWED_AI_ROLES = [
  'Teacher', 'Sensei', 'Staff', 'Clerk', 'Shopkeeper', 'Manager', 'Doctor', 'Nurse', 'Police', 'Officer', 'Station Attendant',
  'Colleague', 'Pedestrian', 'Server', 'Receptionist',
  '先生', '店員', '医者', '看護師', '警察', '駅員', '係員', '受付',
];

// ---------------------------------------------------------------------------
// Scenario architect prompt
// ---------------------------------------------------------------------------

/**
 * Builds the full prompt for generating a new scenario.
 * Source: scenarios.service.ts:buildArchitectPrompt (private method, extracted verbatim)
 */
export function buildArchitectPrompt(dto: GenerateScenarioDto): string {
  const contextExampleDirective = dto.sourceType === 'context-example' && dto.sourceContextSentence && dto.targetVocab
    ? `\n**Context Example Constraints:**\n- You MUST create a roleplay scenario where the user MUST use the target vocab ('${dto.targetVocab}') in a situation matching the following sentence: '${dto.sourceContextSentence}'.\n- The scenario goal MUST involve using this word in context.\n`
    : '';

  return `
You are an expert Japanese language curriculum designer.
Create a "Genki-style" learning scenario for an ADULT traveler/expat (not a student).

**Parameters:**
- Target Level: ${dto.difficulty}
- Theme/Setting: ${dto.theme || 'A common situation for an adult living in Japan'}${contextExampleDirective}

**Requirements:**
1. **Dialogue:** Create a natural, realistic dialogue (6-12 lines). Use a mix of polite and casual forms appropriate for the setting.
2. **Vocabulary:** STRICTLY LIMIT vocabulary to ${dto.difficulty} level. Introduce exactly 3-5 "Target Words" required for the specific goal.
3. **Grammar Notes:** Identify 1-2 key grammar points used in the dialogue and explain them like a textbook (Genki style).
4. **Visual Context:** Provide a descriptive prompt that could be used to generate an image of the scene.
5. **Role Constraints:**
${dto.userRole && dto.aiRole
      ? `   - **User Role:** ${dto.userRole}\n   - **AI Role:** ${dto.aiRole}\n   - Use these exact terms for the 'roles' object and 'participants' array.`
      : dto.userRole
        ? `   - **User Role:** ${dto.userRole} — use this exact term for the user in the 'roles' object and 'participants' array.\n   - **Partner Roles:** ${ALLOWED_AI_ROLES.join(', ')}\n   - Choose an appropriate partner role from the list above for this scenario.`
        : `   - **User Roles:** ${ALLOWED_USER_ROLES.join(', ')}\n   - **Partner Roles:** ${ALLOWED_AI_ROLES.join(', ')}\n   - Use these exact terms (or their Japanese equivalents provided in the list) for the 'roles' object and 'participants' array.`
    }
6. **Data Formatting (CRITICAL):**
   - \`title\`, \`description\` and all \`setting\` object fields should be in English
   - **NO ROMAJI**. Never include Romaji in any field.
   - **Extracted KUs:**
     - \`content\`: Japanese text ONLY (e.g., "本屋"). No readings or definitions in this field.
     - \`reading\`: Kana reading ONLY (e.g., "ほんや"). No Romaji.
     - \`meaning\`: English definition ONLY.
     - \`jlptLevel\`: JLPT level hint for this word (e.g., "N4"). MUST be one of: N5, N4, N3, N2, N1. Use your best judgement for the level of each individual word.
   - For \`grammarNotes\`:
     - \`pattern\`: The extractable grammar pattern in isolation (e.g., "～をお願いします", "～ている"). This should be concise and reusable across contexts.

**Output Schema (Return ONLY raw JSON):**
{
  "title": "Scenario Title",
  "description": "Brief context (e.g. 'You are at a convenience store...')",
  "setting": {
    "location": "Specific location",
    "participants": ["Role A", "Role B"],
    "goal": "What the user needs to achieve",
    "timeOfDay": "Morning/Evening/etc",
    "visualPrompt": "Detailed visual description of the scene for an image generator"
  },
  "roles": {
    "user": "EXACT_NAME_OF_USER_ROLE_FROM_PARTICIPANTS_ARRAY",
    "ai": "EXACT_NAME_OF_AI_ROLE_FROM_PARTICIPANTS_ARRAY"
  },
  "dialogue": [
    {
      "speaker": "EXACT_NAME_FROM_PARTICIPANTS_ARRAY",
      "text": "Japanese text",
      "translation": "English translation"
    }
  ],
  "extractedKUs": [
    {
      "content": "本屋",
      "reading": "ほんや",
      "meaning": "Bookstore",
      "type": "vocab",
      "jlptLevel": "N4"
    }
  ],
  "grammarNotes": [
    {
      "pattern": "The extractable grammar pattern, e.g. ～をお願いします",
      "title": "Grammar Point Name",
      "explanation": "Clear explanation",
      "exampleInContext": {
        "japanese": "The example sentence in Japanese only, no furigana or Romaji",
        "english": "The English translation of the example",
        "fragments": ["minimal", "meaningful", "chunks", "of", "the", "sentence"],
        "accepted_alternatives": ["array of valid re-orderings or omittable-particle variants, or empty array"]
      }
    }
  ]
}

**Grammar Note Fragments Rules:**
- ${FRAGMENT_CONTRACT}
- ${ACCEPTED_ALTERNATIVES_DEF}
`;
}

// ---------------------------------------------------------------------------
// Scenario chat system prompt
// ---------------------------------------------------------------------------

/**
 * Builds the system prompt for a single roleplay chat turn.
 * Source: scenarios.service.ts:handleChat
 *
 * @param scenario - The current scenario document.
 * @param aiRole - The AI's role name (pre-resolved by the service).
 * @param userRole - The user's role name (pre-resolved by the service).
 * @param referenceScript - The formatted dialogue reference string (pre-formatted by the service).
 * @param historyLines - The formatted chat history string (pre-formatted by the service).
 */
export function buildChatSystemPrompt(
  scenario: Scenario,
  aiRole: string,
  userRole: string,
  referenceScript: string,
  historyLines: string,
): string {
  return `
      You are a roleplay partner in a Japanese immersion scenario.
      **Scenario Context:**
      - Title: ${scenario.title}
      - Setting: ${scenario.setting.location}
      - Your Role: ${aiRole}
      - User Role: ${userRole}
      - Goal: ${scenario.setting.goal}
      - Difficulty: ${scenario.difficultyLevel}

      **REFERENCE SCRIPT (PLOT OUTLINE):**
      ${referenceScript}

      **PREVIOUS CHAT HISTORY:**
      ${historyLines}

      **INSTRUCTIONS:**
      1. You are acting out the role of ${aiRole}.
      2. Use the 'REFERENCE SCRIPT' as your guide for the conversation flow.
      3. You must ensure key events/questions from the script occur (e.g., if the script has the shopkeeper ask for a passport, YOU must ask for the passport).
      4. Speak ONLY in Japanese appropriate for the setting and your role.
      5. Engage the user to help them achieve the goal.
      6. Do NOT repeat greetings if they have already been said (check 'PREVIOUS CHAT HISTORY').
      7. Only ask for *missing* details.
      8. Reply naturally to the User's last message.
      9. If the user makes a mistake (grammar/vocab), reply naturally but include a short "correction" in the JSON.
      10. Keep responses concise (1-2 sentences).
      11. CHECK GOAL: If the user has explicitly and successfully achieved the goal ("${scenario.setting.goal}") during this turn, set 'sceneFinished' to true in your JSON response. Otherwise false.
    `;
}
