### Objective & Critical Analysis

   1. The Core Problem: A single Kanji can have multiple readings (on'yomi, kun'yomi), but they are not
       all equally important. Their relevance is almost always determined by the context (i.e., the
      vocabulary word they appear in). Forcing a user to learn the on'yomi "SHOKU" for 食 when they've
      only seen it in 食べる (taberu) is inefficient and confusing.
   2. Component vs. Manual: The distinction you're making is crucial. A "Component Kanji" has a
      built-in context (the vocab word). A "Manually Entered Kanji" does not; the user's intent is more
       general ("I want to learn about this character").
   3. Gemini's Behavior: The model ignoring the instruction to focus on a specific reading is a classic
       LLM problem. They tend to give comprehensive, "encyclopedic" answers unless very strictly
      constrained. We should design our system to work with this behavior instead of fighting against
      it.

  ### Proposed Strategy

  I recommend we treat all Kanji KUs the same fundamentally in the database, but we vary the
  `ReviewFacets` we generate based on their origin (Component vs. Manual). The lesson can be
  comprehensive, but the review must be specific and contextual.

  Here’s the breakdown:

  1. Unified Kanji KU & Comprehensive Lesson
   * A Kanji KU should represent the character itself (e.g., 食). It has one entry in the
     knowledge-units collection.
   * When a lesson is generated for this KU (either because it was a component or entered manually),
     we should ask Gemini for a comprehensive `KanjiLesson`. This lesson should include the meaning,
     common on'yomi, and common kun'yomi readings. This plays to the LLM's strength. This lesson is
     stored in the lessonCache.

  2. Context-Aware Facet Generation (The Core Logic)
  This is where we handle the difference between Component and Manual Kanji.

   * A) For Component Kanji (from a Vocab word):
       1. When a user learns a new Vocab KU (e.g., 食べる), the system identifies the component Kanji
          (食).
       2. It creates a Kanji KU for 食 if one doesn't already exist.
       3. Crucially, it should only generate one `ReviewFacet` for reading: Kanji-Component-Reading for
           食 with the expected answer た. We know this is the correct reading from the Vocab KU's
          reading data.
       4. It can also generate a Kanji-Component-Meaning facet for "eat".
       5. The user learns the most relevant information first. Later, they can visit the Manage page,
          find the 食 KU, and manually trigger the generation of other facets for its other readings if
           they choose.

   * B) For Manually Entered Kanji:
       1. A user adds 食 directly.
       2. They go to the Learn page for 食. A comprehensive lesson is generated and displayed.
       3. The UI, after displaying the lesson, should present a choice: "What do you want to be tested
          on?" It would list out the readings and meanings from the lessonCache.
           * \[x] Meaning: eat
           * \[ ] On'yomi: ショク
           * \[ ] Kun'yomi: たべる
       4. The user checks the boxes for the facets they want. The system then creates only the selected
           ReviewFacets. This puts the user in control and avoids forcing them to learn unused
          readings.

  3. Handling Unused Readings
  This strategy inherently solves the problem of unused readings. We never automatically create
  review facets for them. They are only created when a user explicitly opts in after seeing the
  comprehensive lesson for a manually-entered Kanji.

  ---

  ### Action Plan

  To implement this, we would need to make the following changes:

   1. Modify Vocab "Learn" Flow: When a Vocab item is learned for the first time, the backend logic
      that generates the lesson should also be responsible for:
       * Identifying component Kanji.
       * Creating new Kanji KUs if they don't exist.
       * Creating the single, context-specific Kanji-Component-Reading facet and the
         Kanji-Component-Meaning facet.

   2. Modify Kanji "Learn" Page (`/learn/[kuId]`): For Kanji type KUs, this page needs to be updated.
      After fetching and displaying the lessonCache, it should render a form with checkboxes allowing
      the user to select which facets to create.

   3. Update `review-facets` API: The POST endpoint in /api/review-facets will need to be adjusted to
      handle this new selective creation based on the user's choices from the learn page.

   4. Refine Gemini Prompts: We can refine the KanjiLesson prompt to ask the AI to "Please list the
      most common on'yomi and kun'yomi readings first." This helps the user choose the most important
      ones.

  This approach creates a more intelligent and less frustrating learning experience. It prioritizes
  contextual learning for vocab-derived Kanji while offering flexibility for manually-added Kanji.