# AIGENKI Prompt Library

This document describes the static prompt library in `backend/src/prompts/`, the shared fragments it provides, and the future `PromptService` ideation. All three migration phases are complete — the library is the authoritative home for every AI prompt in the backend.

> **Mandatory logging rule:** Every AI API call MUST be logged via `ApilogService` using the `startLog` → try/finally → `completeLog` pattern. The log entry MUST include the full prompt(s) sent to the model (both `systemPrompt` and `userMessage` where applicable). This is a non-negotiable requirement — any new prompt or refactored call site that omits logging is considered incomplete.

---

## 1. Prompt Library — Current State

All prompts live in `backend/src/prompts/`. No inline prompt strings exist in any service file.

### 1.1 Library files

| File | Exports |
|------|---------|
| `fragments.ts` | `NO_ROMAJI`, `USER_TARGET_LEVEL`, `JSON_ONLY_OUTPUT`, `FRAGMENT_CONTRACT`, `ACCEPTED_ALTERNATIVES_DEF` |
| `vocab.prompts.ts` | `VOCAB_INSTRUCTIONS`, `VOCAB_EXAMPLES`, `buildVocabLessonMessage()`, `buildVocabCacheContext()`, `buildKanjiLessonPrompt()`, `buildKanjiDetailsSystemPrompt()`, `buildKanjiDetailsUserMessage()` |
| `grammar.prompts.ts` | `GRAMMAR_INSTRUCTIONS`, `buildGrammarLessonMessage()` |
| `concept.prompts.ts` | `buildConceptPrompt()` |
| `quiz.prompts.ts` | `VOCAB_QUESTION_OPTIONS`, `VocabQuestionType`, `buildVocabQuestionPrompt()`, `buildVocabQuestionUserMessage()`, `CONCEPT_QUESTION_OPTIONS`, `ConceptQuestionType`, `buildConceptQuestionPrompt()`, `pickRandomQuestionType()`, `ConceptMechanic` type |
| `evaluation.prompts.ts` | `buildAnswerEvaluatorPrompt()`, `ScenarioEvalContext`, `buildScenarioEvaluatorPrompt()` |
| `scenario.prompts.ts` | `ALLOWED_USER_ROLES`, `ALLOWED_AI_ROLES`, `buildArchitectPrompt()`, `buildChatSystemPrompt()` |
| `cloze.prompts.ts` | `CLOZE_SYSTEM_PROMPT`, `buildClozeUserMessage()` |

### 1.2 Fragment usage

| Fragment constant | Used in |
|-------------------|---------|
| `NO_ROMAJI` | `quiz.prompts.ts` (vocab rule 3, concept rule 2), `concept.prompts.ts` (constraints) |
| `USER_TARGET_LEVEL` | `grammar.prompts.ts` (rules), `concept.prompts.ts` (constraints) |
| `JSON_ONLY_OUTPUT` | `quiz.prompts.ts` (vocab rule 13, concept rule 5), `cloze.prompts.ts` (rule 9) |
| `FRAGMENT_CONTRACT` | `concept.prompts.ts` (naturalExample bullets), `scenario.prompts.ts` (Grammar Note Fragments Rules) |
| `ACCEPTED_ALTERNATIVES_DEF` | `concept.prompts.ts` (naturalExample bullets), `scenario.prompts.ts` (Grammar Note Fragments Rules) |

---

## 2. Shared Fragments (Candidates for Extraction)

These text blocks appear in **two or more prompts** with minimal variation:

| Fragment | Appears in | Notes |
|----------|-----------|-------|
| **No-Romaji rule** | Vocab, Grammar, Concept, Scenario architect, Kanji, Question | Exact wording varies slightly ("Do not include Romaji", "**NO ROMAJI**", "Do not use Romaji at all") — should be unified |
| **User target level** (`USER_TARGET_LEVEL`) | Vocab, Grammar, Concept, Vocab question, Concept question | Wording: "no more complex than JLPT N4", "simple, standard grammar and vocabulary (equivalent to JLPT N4)", "Keep example sentences at or below JLPT N4" |
| **JSON-only output guard** | Vocab question, Concept question, Cloze, Concept page | "Do NOT output any text before or after the JSON object. Do NOT use markdown code blocks or backticks." |
| **Fragment assembly contract** | Concept page (`naturalExample`), Grammar instructions, Scenario architect | "When concatenated in order, the strings in the fragments array MUST perfectly reconstruct the japanese string." |
| **`accepted_alternatives` definition** | Concept page, Grammar instructions, Scenario architect | Lists valid re-orderings of the same fragments — NOT rephrased translations |
| **Expert role declaration** | Every prompt | "You are an expert Japanese tutor..." / "You are a kind and thoughtful Japanese language teacher..." — slight intentional variation but could be standardized with a parameter |
| **Answer evaluation schema** | Answer evaluator | Appears as both a JSON schema in the evaluator prompt and as the `responseSchema` passed to the API — should be a single source of truth |

---

## 3. Library Design Principles

**Static strings vs. parameterized functions:** Prompts with no runtime data are `export const` strings. Prompts that embed runtime values are `export function` builders that return strings. This keeps the library pure — no I/O, trivially testable.

**Fragment composition:** Prompt files import shared constants from `fragments.ts` and interpolate them into template literals. The constants are sentence-level: a numbered rule, a standalone bullet, or a self-contained section. Text that is embedded mid-sentence in a prompt is intentionally left as-is to avoid breaking model-relevant phrasing.

**`CLOZE_SYSTEM_PROMPT` is a caching candidate:** It is fully static and quite long — a future optimisation pass could load it as Gemini context cache (like `buildVocabCacheContext()` does for batch vocab generation).

---

## 4. Migration History (complete)

**Phase 1 — Created `backend/src/prompts/`** with all 8 files. All prompts extracted to named exports; no service files changed.

**Phase 2 — Updated all 6 services** to import from the library. Zero inline prompt strings remain in service files. TypeScript compiles cleanly.

Services updated: `lessons.service.ts`, `concepts.service.ts`, `gemini.service.ts`, `questions.service.ts`, `reviews.service.ts`, `scenarios.service.ts`.

**Phase 3 — Replaced literal fragment text** with imports from `fragments.ts`. All 5 fragments (`NO_ROMAJI`, `USER_TARGET_LEVEL`, `JSON_ONLY_OUTPUT`, `FRAGMENT_CONTRACT`, `ACCEPTED_ALTERNATIVES_DEF`) are now used at every applicable site.

---

## 5. PromptService — Future Ideation

A `PromptService` would sit between the static library and `GeminiService`, assembling final prompts from fragments and runtime context. It would **not** make network calls.

```
PromptService.buildPrompt(type: PromptType, context: PromptContext): AssembledPrompt
```

Where `AssembledPrompt` is:
```typescript
interface AssembledPrompt {
  systemPrompt?: string;   // for generateContent config.systemInstruction
  userMessage: string;     // for contents[0].parts[0].text
  temperature?: number;    // recommended temperature for this prompt type
  schema?: Schema;         // recommended responseSchema
}
```

**Benefits this enables:**
- **Centralised temperature management** — today temperature is scattered across call sites (`0.4` for lessons, `0.1` for cloze, `0.5` for concepts, unset for questions). `PromptService` can own these defaults.
- **Schema co-location** — the `responseSchema` passed to the Gemini API is currently defined at the call site in `GeminiService`. Moving it next to its prompt makes them impossible to get out of sync.
- **Testability** — `PromptService` is a pure transformation function with no I/O, trivially unit-testable.
- **A/B prompt experimentation** — swap prompt variants behind a flag without touching service business logic.
- **Prompt versioning** — tag prompts with a version string, log it in `api-logs` for debugging regressions.

**What it should NOT do:**
- Make Firestore or Gemini API calls — it stays a pure transformer.
- Own `GeminiService` — the transport layer stays separate.
- Replace `GeminiService` method signatures — services still call `geminiService.generateLesson(assembled.userMessage)`. `PromptService` just builds the argument.

**Suggested NestJS shape:**

```typescript
@Injectable()
export class PromptService {
  buildVocabLesson(content: string, useCached: boolean): AssembledPrompt { ... }
  buildGrammarLesson(ku: GrammarKnowledgeUnit): AssembledPrompt { ... }
  buildVocabQuestion(topic: string, reading?: string, meaning?: string): AssembledPrompt { ... }
  buildConceptQuestion(mechanic: ConceptMechanic): AssembledPrompt { ... }
  buildAnswerEvaluator(q: EvalContext): AssembledPrompt { ... }
  buildScenarioArchitect(dto: GenerateScenarioDto): AssembledPrompt { ... }
  buildScenarioChat(scenario: Scenario, aiRole: string, userRole: string, history: ChatMessage[]): AssembledPrompt { ... }
  buildScenarioEvaluator(context: ScenarioContext, history: ChatMessage[]): AssembledPrompt { ... }
  buildClozeSentence(vocab: string, sentence: string): AssembledPrompt { ... }
  buildConceptPage(topic: string, notes?: string): AssembledPrompt { ... }
  buildKanjiLesson(content: string): AssembledPrompt { ... }
  buildKanjiDetails(kanji: string): AssembledPrompt { ... }
}
```

`PromptService` would be `@Global()` (following the established pattern for cross-cutting services) and added to `GeminiModule` or a new `PromptsModule`.

---

## 6. Open Questions

1. **Versioning granularity**: Version the whole `PromptService` (one version field) or per-prompt? Per-prompt is more surgical for debugging but adds overhead.

2. **Grammar lesson message vs. instructions split**: `buildGrammarLessonMessage` currently concatenates the runtime preamble and `GRAMMAR_INSTRUCTIONS` into a single `userMessage`. Splitting them into `systemPrompt` + `userMessage` (matching the vocab question pattern) could improve caching for the static instructions half.

3. **Cloze system prompt as cached content**: `CLOZE_SYSTEM_PROMPT` is fully static and long — a candidate for Gemini context caching, like `buildVocabCacheContext()` for batch vocab.

4. **History formatting for `buildScenarioEvaluatorPrompt`**: History-to-text formatting was moved from `GeminiService` into `buildScenarioEvaluatorPrompt`. If a `PromptService` is introduced, this formatting logic (and equivalent logic in `buildChatSystemPrompt`) should stay in the prompt builder, not be pushed back into service code.
