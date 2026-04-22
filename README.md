# Spatial

Spatial-control Gemini chat prototype.

## Run locally

Create a `.env` file with:

```sh
GEMINI_API_KEY=your_key_here
```

Then start the local server:

```sh
npm run dev
```

Open the URL printed in the terminal. The server starts on port `8000`, or the next open port if `8000` is already in use.

## Deploy to Vercel

This repo is ready for Vercel:

- `index.html` is served as the static frontend.
- `api/chat.mjs` is the Vercel Serverless Function for `/api/chat`.
- `GEMINI_API_KEY` must be configured in Vercel project settings.

Steps:

1. Push this folder to a GitHub repo.
2. Import the repo in Vercel.
3. In Vercel, open Project Settings -> Environment Variables.
4. Add `GEMINI_API_KEY` for Production, Preview, and Development.
5. Deploy.

Do not prefix the key with `NEXT_PUBLIC_`; it must stay server-side only.

If the deployed site shows `Not found`, check that Vercel's Project Settings -> Root Directory points at the folder containing `index.html`, `api/chat.mjs`, and `vercel.json`, then redeploy.
