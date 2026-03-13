# AISRS-Japanese Backend

This is the NestJS backend for the AISRS-Japanese project. It provides the REST API and manages all interactions with the Firestore Database and the Google Gemini API.

## Documentation
Please refer to the root project documentation for architectural guidelines and domain details:
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DOMAIN_MODEL.md](../DOMAIN_MODEL.md)
- [AGENT_INSTRUCTIONS.md](../AGENT_INSTRUCTIONS.md)

## Requirements
- Node.js (LTS version)
- Yarn
- Google Gemini API Key (`GEMINI_API_KEY` mapped in `.env.local` or `.env`)
- Firebase local emulator suite running on port 8080 (optional, for testing)

## Setup & Running
```bash
# install dependencies
$ yarn install

# development (runs on port 3500)
$ yarn run start:dev
```
