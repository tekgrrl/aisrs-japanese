# AISRS-Japanese Architecture

This document describes the high-level architecture of the AISRS-Japanese project.

## Overview
AISRS-Japanese is a bilingual Language Learning app utilizing AI (Google Gemini) to generate comprehensive lessons and reviews tailored to the user's progress. 

The application is built on a split architectural model:
- **Frontend** (`/frontend` folder): A Next.js 15 app router application providing the UI.
- **Backend** (`/backend` folder): A NestJS REST API server handling all business logic, DB interactions, and third-party API calls.
- **Database**: Firebase Firestore.
- **AI Brain**: Google Gemini via `@google/genai` (used extensively in the `/backend/src/gemini` and `/backend/src/lessons` modules).

## Design Principles
1. **Separation of Concerns**: The frontend is strictly a view layer containing UI components, React state, and data-fetching hooks. The backend is the definitive source of truth and the only service allowed to connect directly to the database.
2. **AI-First Generation**: Content is dynamically generated using the current model (Gemini 3.0 Flash Preview) instead of relying on pre-authored datasets. Knowledge Units (KUs), lessons, and review-facets are distinct entity types, each having its own document, and are assembled just-in-time.
3. **Database Workflow**: For local development, the backend handles all database interactions. You can optionally use the Firestore Emulator (`localhost:8080`) for testing.

## Component Responsibilities

### Frontend (`/frontend`)
- **Framework**: Next.js 15+, React 19, TypeScript, Tailwind CSS v4.
- **Core App**: Built around `/src/app/learn`, `/src/app/review`, `/src/app/manage`, and `/src/app/scenarios`.
- **API Interaction**: The frontend natively queries the backend endpoint (`http://localhost:3500`). It does **not** query Firestore directly. Next.js server-side features are minimized in favor of the specialized NestJS backend.
- **State Synchonization**: Uses lightweight approaches like dispatching custom client-side events (e.g., `refreshStats`) that components listen to and respond by re-fetching data via their hooks.

### Backend (`/backend`)
- **Framework**: NestJS 10+, TypeScript.
- **Module Structure (Core):**
  - **`knowledge-units`**: CRUD operations and schema logic for KUs.
  - **`review-facets`**: Logic handling the Spaced Repetition System (SRS). Converts learning queue items to review queues using `nextReviewAt` timestamp filtering.
  - **`lessons`**: Assembles Prompts, queries Gemini, and translates the structured JSON or text back to the client.
  - **`scenarios`**: Complex logic handling multi-turn roleplay conversations, evaluations, and state machines mapping encountering new phrases to learning loops.
  - **`stats`**: Central endpoint for aggregating dashboard/queue numbers.
- **Database Access**: Uses `firebase-admin` natively (not via Web SDK). Note: Next.js API Routes must not use `firebase-admin`; thus, all such operations are fully isolated in this NestJS layer.
- **Gemini**: Relies heavily on high-context, single prompt instructions using the current model (`gemini-3-flash-preview`) rather than generic `systemInstruction` prompts.

## Development Setup
- **Node/Package**: Uses `yarn` workspaces or separated `yarn` installs in each folder depending on CI config. DO NOT USE `npm`.
- **Running Locally**:
  - Frontend: Runs on `http://localhost:3000` (`yarn dev` inside `/frontend`)
  - Backend: Runs on `http://localhost:3500` (`yarn start:dev` inside `/backend`)
  - Firestore Emulator (Optional for testing): Runs on `http://localhost:8080` (usually launched via root `firebase emulators:start`)

## Migration History
Previously, the Next.js `frontend` app hosted Next API Routes (`/src/app/api/...`) that directly connected to a `db.json` and then migrated to Firestore. Those legacy Next.js API endpoints are now deprecated and moved into the `legacy-api/` directory (or removed). The backend is strictly the `/backend` folder.
