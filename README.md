# Spatial

Hands-free spatial AI interface using webcam hand tracking.

SPATIAL separates browser-only gesture tracking from server-side model access. The browser never receives provider API keys; it sends conversation state to `/api/chat`, where the server validates input, rate-limits requests, calls the configured model provider, and returns a concise reply.

## Demo Flow

1. Open the app and initialize SPATIAL.
2. Enable vision and allow camera access.
3. Use the right hand to queue a prompt.
4. Use the left hand to hold a control for 2 seconds.
5. Watch action state, latency, and debug telemetry update.

Right hand prompts:

- Open palm: brief status and next move.
- Peace sign: compare options and recommend one.
- Three fingers: build a concrete plan.
- Fist: critique risks and alternatives.

Left hand controls:

- Pinch: send.
- Peace sign: scroll up.
- Open palm: scroll down.
- Fist: clear conversation.

Keyboard fallback:

- `1`-`4`: queue prompt presets.
- `S`: send.
- Arrow/Page keys: scroll.
- Space: pause tracking.

## Architecture

- `index.html`: static shell.
- `styles.css`: visual system.
- `src/main.js`: browser app orchestration, camera loop, UI state.
- `src/gestures.js`: pure gesture classification, hand-labeling, hold tracking.
- `src/api.js`: browser chat API client.
- `api/chat.mjs`: Vercel Serverless Function for `/api/chat`.
- `lib/model.mjs`: provider selection and model orchestration.
- `lib/gemini.mjs`: Gemini provider.
- `lib/openai.mjs`: OpenAI Responses API provider.
- `lib/messages.mjs`: validation and message normalization.
- `lib/rate-limit.mjs`: basic in-memory rate limiting.
- `tests/`: Node test coverage for gesture and server logic.

## Run Locally

Create `.env`:

```sh
MODEL_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
```

Then run:

```sh
npm run dev
```

Open the printed URL. The local server starts on port `8000`, or the next open port if `8000` is already in use.

## Test

```sh
npm run check
npm test
```

Optional API smoke test:

```sh
curl -sS http://localhost:8000/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Reply with exactly: Gemini OK"}]}'
```

## Deploy To Vercel

This repo is ready for Vercel:

- `index.html` is the static frontend.
- `api/chat.mjs` is the Serverless Function.
- `vercel.json` rewrites `/` to `/index.html`.
- Provider keys must be configured as server-side environment variables.

Steps:

1. Push this folder to GitHub.
2. Import the repo in Vercel.
3. Confirm Root Directory points to the folder containing `index.html`, `api/chat.mjs`, and `vercel.json`.
4. Add environment variables in Project Settings.
5. Redeploy.

Gemini:

```text
MODEL_PROVIDER=gemini
GEMINI_API_KEY=...
```

OpenAI:

```text
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5
```

Do not prefix keys with `NEXT_PUBLIC_`; that would expose them to the browser.

## Engineering Notes

- Gesture classification is isolated and covered by tests.
- Destructive and model-triggering actions require a 2-second hold.
- Calibration and swap controls handle webcam handedness differences.
- Prompt presets are editable in the UI and keyboard-accessible.
- Backend input is validated before provider calls.
- API calls have a timeout and basic per-instance rate limiting.
- The model provider boundary supports Gemini today and OpenAI through `MODEL_PROVIDER=openai`.

## Tradeoffs

- In-memory rate limiting is sufficient for a prototype but should move to Redis or a managed store for production.
- Browser webcam hand tracking varies by lighting and camera angle, so calibration remains user-driven.
- MediaPipe runs client-side, which preserves privacy and keeps server cost low, but older devices may struggle.
- Vercel functions are stateless, so long-term analytics and traces would need an external store.

## Demo Assets

Use `docs/demo-script.md` as a recording guide for a short demo GIF or video.
