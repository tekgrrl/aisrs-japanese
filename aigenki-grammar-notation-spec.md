# AIGENKI Grammar Notation Specification

## Purpose

One canonical notation string per grammar knowledge unit (KU). Every other representation — structural/dev view, UI pills, worked example sentences, audio narration — is **derived from that canonical string at render time**. Never hand-author a second representation of the same KU; that reintroduces the drift problem this spec exists to prevent (see the 咲く/磨く vocab-levelling precedent: two independently-maintained facts about the same unit silently disagreed).

---

## 1. Slot Tokens

Closed vocabulary. Each token names a word class **and** its required conjugated form — never class alone, since "verb" isn't enough information to know what attaches.

| Token | Meaning |
|---|---|
| `{V-dict}` | Verb, dictionary form |
| `{V-masu}` | Verb, ます-stem (ます dropped) |
| `{V-te}` | Verb, て-form |
| `{V-nai}` | Verb, ない-form |
| `{V-ta}` | Verb, た-form |
| `{V-ba}` | Verb, ば-form |
| `{Adj-i}` | い-adjective, full form |
| `{Adj-i·stem}` | い-adjective, い dropped (for く-attachment) |
| `{Adj-na}` | な-adjective, な already dropped |
| `{N}` | Noun |
| `{Cl}` | Full clause (subject + predicate) — not a single word |

**Multiple slots of the same type:** disambiguate with a subscript naming the grammatical role, not a bare A/B, wherever a role name is available: `{N_group}` / `{N_target}`, `{Cl₁}` / `{Cl₂}`. Role names must be reused identically across every KU that shares that role — this naming also drives the pill-label mapping in Section 6, so an inconsistent name here breaks that mapping too.

---

## 2. String Formatting Rule

Write notation exactly as real Japanese appears — **no cosmetic whitespace**. `{}` tokens are the only visual segmentation the format allows. Real Japanese has no spaces; a space in the source data must never be load-bearing, and treating it as decoration only (rather than eliminating it) is how the old `～` notation became ambiguous.

Correct: `{V-masu}ながら、{Cl}`
Wrong: `{V-masu} ながら、 {Cl}`

Punctuation that is genuinely part of the pattern (the 、 before a second clause, for example) stays in the string as literal text, not as a token.

---

## 3. Clause-Count Tag

Every KU carries `clause_count: 1 | 2`.

- **1**: the pattern completes, or is, a single predicate.
- **2**: the pattern joins two independent clauses; both clause slots must appear explicitly in the notation.

---

## 4. Branched Patterns

When the surface form depends on the type of thing filling a slot (な-adjective vs い-adjective take different endings for the same underlying meaning), represent as **named branches under one KU id** — never conflate into a single ambiguous string, and never split into two unrelated KUs that can drift apart.

```yaml
ku_id: change-of-state
branches:
  na-adjective: "{Adj-na}になります"
  i-adjective:  "{Adj-i·stem}くなります"
```

---

## 5. Constraints Live in Metadata, Never in the Notation String

The notation string answers "what does this look like." A separate metadata block answers "when is it valid." Do not encode usage rules as prose inside the pattern.

Metadata fields identified so far:

```yaml
requires_same_subject: bool          # e.g. true for ながら (simultaneous)
verb_aspect: durative_only | any     # ながら rejects momentary verbs (割れる, etc.)
verb_type: action_only | existence_only | any   # governs に vs で
register: casual | standard | formal
jlpt_level: N5 | N4 | N3 | N2 | N1
notes: string                        # free text, e.g. "concessive reading exists as a separate KU — do not conflate"
```

---

## 6. Render Targets — All Derived, None Persisted

From one canonical string + its metadata, generate at request time:

- **Structural/dev view** — the canonical notation itself (authoring/QA surface)
- **UI pills** — each slot token mapped to `{label, color}` **by token type**, not by KU instance. One small mapping table, reused everywhere. Decide now what happens on an unmapped token: unstyled fallback pill, or a build-time error — pick one, don't leave it implicit.
- **Natural worked example** — a concrete filled sentence, with span offsets tagging which text corresponds to which slot (drives highlight rendering)
- **Audio/TTS narration** — reads the worked example only; slot labels themselves are never spoken

Nothing in this list is cached or independently edited. Regenerating from the canonical string is what keeps there being exactly one place to fix when something's wrong.

---

## 7. Reference Corpus (KUs established to date)

| KU | Notation | Clauses | Key metadata |
|---|---|---|---|
| change-of-state (な) | `{Adj-na}になります` | 1 | branch: na-adjective |
| change-of-state (い) | `{Adj-i·stem}くなります` | 1 | branch: i-adjective; irregular いい→よく |
| completion (affirmative) | `もう{V-ta}` | 1 | branch: affirmative |
| completion (negative) | `まだ{V-nai}` | 1 | branch: negative |
| reason | `{Cl₁}から、{Cl₂}` | 2 | — |
| group-membership (bare) | `{N}の中で{Cl}` | 1 | no comparison implied |
| group-superlative | `{N_group}の中で{N_target}が一番{Adj}` | 1 | が-marked target is required, not optional |
| locational の中で | `{N-place}の中で{Cl}` | 1 | verb_type: action_only (で, not に) |
| comparison | `{N_A}は{N_B}より{Adj}` | 1 | — |
| simultaneous action | `{V-masu}ながら、{Cl}` | 2 | requires_same_subject: true; verb_aspect: durative_only |
| request | `{N}をください` | 1 | — |
| sequence | `{V-ta}後で、{Cl}` | 2 | — |
| ongoing action | `{V-te}いる` | 1 | — |

**Adjacent but deliberately separate KUs** (same stem or related meaning — do not merge or auto-link):

- `ようになります` — verb "become able to" (N4). Not a branch of change-of-state; different underlying mechanism (nominalizes a verb clause).
- `ながらも` — concessive "although" (N4/N3). Shares ながら but expresses contrast, not simultaneity; different metadata entirely (no same-subject requirement, attaches to adjectives/nouns too).
- `のうち(で)` — near-synonym of の中で, skews toward numeric/counter groupings vs general groupings. Cross-reference, don't merge.

**Excluded from grammar entirely — vocab only, no `relatedConcepts` link:**

- `世の中` — lexicalized noun (世+の+中 fused into "society/the world"), not a live instance of の中で. Takes ordinary particles like any noun.
- `同士` — false friend via shared English gloss ("among/fellow"); actually means mutual relationship, unrelated grammar.
- `なかなか` — unrelated word; surface collision with 中 only, no shared grammar.

---

## 8. Open Decisions (flag for implementation, not yet settled)

- Pill label naming: conversation used both **Group/Target** and **Category/Item** for the same slots — pick one before generating the label-mapping table, and use it in both the structural subscript names (Section 1) and the pill labels (Section 6).
- Unmapped-token fallback behavior (Section 6) — unstyled pill vs build error.
- Delimiter collision check — if pill markup ever passes through a real markdown parser, confirm `[Label]` immediately followed by `(` elsewhere in the same string can't be misread as link syntax.
- Multi-pill line-wrap behavior at 3–4 slots — verified only at 2–3 pills so far.
