# **AISRS Requirements: The "Learn" Flow (Phase 3.A)**

## **1\. Overview**

This document outlines the requirements for a fundamental change to the AISRS application, pivoting from a simple "review" model to a "teach-first" model.

The current user flow is:  
Manage (Create KU) \-\> Manage (Generate Facets) \-\> Review  
The new, proposed user flow is:  
Manage (Create KU) \-\> Learn (Lesson & Facet Selection) \-\> Review  
This new "Learn" step interposes a dedicated teaching moment between creating a knowledge unit and reviewing it. This addresses a core design flaw by allowing the user to be *taught* the material by an AI tutor and *choose* what they want to be quizzed on, rather than being forced to review all default facets.

## **2\. Core Components & Requirements**

### **REQ-01: Backend Preparation (The "Flag")**

To enable a separate "Learn" queue, new Knowledge Units (KUs) must be flagged as "learning" until the user has explicitly created facets for them.

* **1.1. Data Schema:** The KnowledgeUnit interface in src/types/index.ts **must** be updated to include:  
  * status: 'learning' | 'reviewing';  
  * facet\_count: number;  
* **1.2. KU Creation:** The POST /api/ku/route.ts handler **must** be modified. When a new KU is created, it **must** be saved with:  
  * status: 'learning'  
  * facet\_count: 0  
* **1.3. Facet Creation:** The POST /api/review-facets/route.ts handler **must** be modified. When it successfully creates facets for a KU, it **must** update that parent KU's document to:  
  * status: 'reviewing'  
  * Increment facet\_count by the number of facets created.

### **REQ-02: The "Learn Queue" UI (The Hub)**

The application header and navigation must be updated to reflect the new "Learn" vs. "Review" queues.

* **2.1. Stats API:** A new API route **must** be created at GET /api/stats/route.ts.  
* **2.2. Stats Logic:** This API **must** query Firestore for two counts and return them as JSON:  
  * learnCount: Count of KUs where('status', '==', 'learning').  
  * reviewCount: Count of ReviewFacets where('nextReviewAt', '\<=', Timestamp.now()).  
* **2.3. Header UI:** The src/app/components/Header.tsx component **must** be refactored:  
  * It **must** fetch data from GET /api/stats on load.  
  * The "Learn" and "Review" links **must** be styled as buttons and display their respective counts as badges (e.g., "Learn (3)", "Review (10)").  
* **2.4. Learn Page Stub:** A new page **must** be created at src/app/learn/page.tsx to serve as the entry point for the "Learn" queue.

### **REQ-03: The "Lesson Engine" (Backend)**

An API must be created to dynamically generate a WaniKani-style "lesson" for any given KU.

* **3.1. Lesson API:** A new API route **must** be created at POST /api/generate-lesson/route.ts.  
* **3.2. Lesson Logic:** This API **must** accept a { kuId: "..." } in its body.  
* **3.3. LLM Prompt:** It **must** call the Gemini API with a "Lesson Planner" prompt, instructing the LLM to return a rich JSON object for the given KU.  
* **3.4. Lesson JSON Output:** The JSON response **must** contain keys for:  
  * meaning\_explanation (string)  
  * reading\_explanation (string)  
  * context\_examples (array of { sentence: string, translation: string })  
  * component\_kanji (array of { kanji: string, reading: string, meaning: string })

### **REQ-04: The "Lesson Page" UI (v1)**

The "Learn" page must present the AI-generated lesson and allow the user to select which facets to learn.

* **4.1. Lesson Data Fetch:** The src/app/learn/page.tsx **must** fetch the first available KU where('status', '==', 'learning').  
* **4.2. Lesson Generation:** It **must** then call POST /api/generate-lesson with that KU's ID to get the lesson JSON.  
* **4.3. Lesson Render:** It **must** render all data from the lesson JSON in a clear, "WK-style" format (e.g., "Meaning" section, "Reading" section, etc.).  
* **4.4. Facet Selection UI:** Based on the lesson JSON, the page **must** render a checklist of *suggested facets*.  
  * Example: A checklist with items like \[ \] Meaning, \[ \] Reading, \[ \] Kanji: 食, \[ \] Context Example 1\.

### **REQ-05: The "Facet Selection" (Backend)**

The review-facets API must be refactored to create *only* the facets selected by the user.

* **5.1. API Refactor:** The POST /api/review-facets/route.ts handler **must** be modified to accept a { kuId: "...", facetsToCreate: string\[\] } body.  
* **5.2. Selective Creation:** It **must** iterate over the facetsToCreate array and create *only* those specific facets (e.g., "Content-to-Definition").  
* **5.3. Complex Facet Logic:** It **must** be able to handle "complex" facets (e.g., "Kanji-Component-食"). This logic must:  
  * Search Firestore for an existing Kanji KU for "食".  
  * If not found, auto-create a new Kanji KU for "食" (potentially using an LLM call to populate its data).  
  * Create the new facet, linking it to the (new or existing) Kanji KU's ID.  
* **5.4. Status Update:** This API **must** update the parent KU's status to 'reviewing' as specified in **REQ-1.3**.

## **3\. Future Vision (v2)**

The "Lesson Page" UI (REQ-04) is the foundation for a more interactive experience.

* **v2.1 Chat Interface:** The static "WK-style" page **will be** replaced with an interactive chat window.  
* **v2.2 Collaborative Learning:** The chat bot will present the lesson and *collaborate* with the user to decide which facets to create, fulfilling the "AI Tutor" goal.