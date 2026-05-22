# Content Quality Guide

This document explains how AIGENKI enforces level-appropriate content and how to investigate and correct violations.

---

## Core Principle: JLPT as Curated Learning Paths

JLPT levels are not abstract difficulty buckets — they are curated learning paths that expose learners to a consistent, well-defined vocabulary and grammar set. An N5 learner should encounter the same set of N5 vocabulary across all generated content, not vocabulary that happens to feel "easy enough."

**The constraint is always: `ku.data.jlptLevel ≤ user.preferences.jlptLevel`.**

Content generated for a user must use vocabulary and grammar at or below that user's declared JLPT level in all surrounding sentences, context examples, and scenario dialogue. The target word or pattern being taught is the sole exception — it can be at any level, since that is the point of the lesson.

---

## Above-Level Items: Separate Path

Users may elect to enroll in vocabulary or grammar above their declared level (e.g., a word they've encountered and want to learn). These items are marked `aboveLevel: true` on their `UserKnowledgeUnit` document at enrollment time.

Above-level items are learned in isolation. They are:
- **Excluded** from `tutorContext.allowedGrammar` — they do not become part of the ambient generation context
- **Excluded** from the `get_user_level` and `get_grammar_patterns` tool responses
- **Not** injected into scenario dialogue, sentence-assembly fragments, or audio facets

This ensures that voluntarily learning an advanced item doesn't contaminate every other generated piece of content.

---

## How Level Constraints Are Applied

Every prompt that generates user-facing Japanese content calls the `get_user_level` Gemini function tool before generating anything. This tool returns:

```json
{
  "jlptLevel": "N4",
  "allowedGrammar": ["〜ている", "〜たことがある", "〜たら", ...]
}
```

`allowedGrammar` is the user's actual enrolled grammar patterns, filtered to in-level items only (i.e., `aboveLevel != true`). Prompts must use **only** patterns from this list for surrounding sentences — not the full static JLPT grammar schema.

The user's `jlptLevel` also drives a `levelConstraint` injected into every lesson generation prompt: *"Keep all example sentences at or below JLPT [level], even if the target vocabulary or pattern is more advanced."*

---

## What Counts as a Violation

The `ValidationService` checks generated content post-generation using a Gemini flash model with structured output. It flags:

- **vocab**: A vocabulary item that belongs to a JLPT level above the user's declared level
- **grammar**: A grammar pattern that belongs to a JLPT level above the user's declared level

The validator checks:
- `context_examples[].sentence` for Vocab lessons
- `examples[].japanese` for Grammar lessons

Violations are stored in `content-flags` (Firestore collection) and also written to `lessons/{kuId}.validation`.

---

## Content Flags

Each flag record (`ContentFlag`) contains:

| Field | Description |
|---|---|
| `kuId` | The Knowledge Unit whose lesson triggered the flag |
| `kuContent` | The Japanese word or pattern being taught (e.g. 食べる) |
| `userLevel` | The user's JLPT level at generation time |
| `violations` | Array of `{ segment, detectedLevel, type }` |
| `status` | `open` → `resolved` or `dismissed` |
| `dismissNote` | Free-text reason if dismissed |

Flags are global (not per-user) because lesson content is global — one lesson document shared by all users at a given level.

---

## Resolving Flags

### Via Admin UI (`/admin/content-quality`)

The admin UI shows all open flags with the offending segments highlighted. Each flag has three actions:

- **Regenerate**: Clears the lesson document and re-triggers generation. The lesson will be re-validated automatically. If it passes, the flag is resolved automatically. If it fails again, a new flag is created.
- **Resolve**: Marks the flag as `resolved` manually (e.g., after editing the lesson directly via the Lesson editor).
- **Dismiss**: Marks the flag as `dismissed` with an optional note explaining why the content is acceptable despite the violation.

### Via Claude Code Skill (`/review-content-flags`)

The skill fetches open flags and applies contextual reasoning for each:

1. **Is the violation real?** The validator is conservative but not perfect. An N4 word used as an example in an N4 lesson is not a violation even if it's technically N4. Context matters.
2. **Is the violation severe?** A single N3 grammar particle in an N5 lesson is more severe than a borderline N4 vocabulary item in an N3 lesson.
3. **What is the fix?** Options in order of preference:
   - Dismiss with a note if the content is borderline or the validator is being over-cautious
   - Edit the specific sentence directly in the lesson (using the Lesson editor or Firestore) if the fix is a targeted substitution
   - Regenerate if the lesson content is broadly above-level

---

## Validation Service Details

**Model**: `MODEL_GEMINI_FLASH` (env var, defaults to `gemini-2.0-flash`)

**Prompt structure**: System prompt instructs the model to identify vocabulary and grammar above the target JLPT level. User message is the joined set of example sentences.

**Output schema**:
```typescript
{
  valid: boolean;
  violations: Array<{
    segment: string;        // exact Japanese segment
    detectedLevel: string;  // e.g. "N3"
    type: 'vocab' | 'grammar';
  }>;
}
```

All validation calls are logged to the `api-logs` Firestore collection under route `/validation/content`.

---

## Lesson `validation` Field

Every lesson document can carry a `validation` field:

```typescript
{
  status: 'pending' | 'pass' | 'fail';
  checkedAt?: Timestamp;
  violations?: Array<{ segment: string; detectedLevel: string; type: 'vocab' | 'grammar' }>;
}
```

This is written non-blockingly after every new lesson generation. Existing lessons that predate the validation system will have no `validation` field (treat as `pending`).
