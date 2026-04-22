# Architecture

SPATIAL uses a thin static frontend and a small server-side model gateway.

## Frontend

The browser owns all webcam and gesture work:

- MediaPipe Hand Landmarker runs in the browser.
- `src/gestures.js` classifies broad gestures from hand landmarks.
- `src/main.js` routes right-hand prompt selection and left-hand held controls.
- Debug mode exposes current hand labels, gestures, confidence, and wrist position.

## Backend

The backend owns all provider calls:

- `/api/chat` validates request payloads.
- Rate limiting protects the model endpoint.
- `lib/model.mjs` selects the provider.
- Provider modules call Gemini or OpenAI with a timeout.

## Security Boundary

The browser never receives `GEMINI_API_KEY` or `OPENAI_API_KEY`. It only calls `/api/chat` with conversation messages. Provider credentials are read from server-side environment variables.
