# STMPD

Fill, sign and flatten PDFs in the browser. React + Vite, deployable to GitHub Pages.

## Run
    npm install
    npm run dev          # demo mode works with no backend
    npm run build        # outputs dist/ for GitHub Pages

## Connect the backend (optional)
1. Create a Supabase project; run `supabase/migrations/001_usage.sql`.
2. Copy `.env.example` to `.env.local` and fill in URL + anon key.
3. Deploy functions and set secrets:
       supabase functions deploy map-fields consume-free
       supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.5-flash

Without the backend: no AI mapping, no sign-in, no download limit (demo mode).

## Not built yet
Stripe billing, signature vault, audit-trail page, AI value suggestions for fillable PDFs,
Turnstile / fingerprinting (replaced by required email sign-up).
