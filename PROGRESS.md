# Progress notes

Personality-quiz site (MBTI-style), built with Next.js 16 + Supabase + Vercel.
Nothing is committed to git yet (all files untracked) and Vercel project has not
been created yet.

## Stack / accounts

- Supabase project: https://cofccoayvgugynyfcemb.supabase.co
- Supabase publishable key + URL live in `.env.local` (gitignored; `.env.example`
  has the placeholder shape and IS committed)
- Auth: Google OAuth only (no password/email auth, no SMTP needed) — Google Cloud
  Console OAuth client and Supabase "Google" provider are both configured and
  tested working end-to-end (sign-in redirects to Google, comes back to
  `/account` signed in)
- Vercel: not set up yet

## What's built

- Scaffolded with `create-next-app` (TypeScript, Tailwind, App Router, `src/` dir)
- `src/lib/supabase/{client,server,middleware}.ts` — browser/server Supabase clients
- `src/proxy.ts` — session-refresh middleware (Next 16 renamed `middleware.ts` -> `proxy.ts`)
- DB schema: `supabase/migrations/0001_init.sql`
  - Tables: quizzes, quiz_dimensions, questions, question_options, result_profiles,
    attempts, answers
  - RLS: published quiz content is public-read; anyone can insert an attempt/answer
    (anonymous quiz-taking allowed); only the owning user can *read back* their
    own attempts/answers
- `supabase/migrations/0002_fix_attempts_rls.sql` — fixes a bug in 0001 where the
  attempts/answers SELECT policies would've let any signed-in user read *every*
  anonymous visitor's history, not just their own. Must be run if 0001 was applied
  before this fix existed.
- `supabase/seed.sql` — one sample quiz ("What's Your Personality Type?"), 4
  dimensions (EI/SN/TF/JP), 8 questions, all 16 MBTI-style result profiles
- `src/lib/quiz/scoring.ts` — turns summed dimension scores into a 4-letter code
- Pages:
  - `/` — lists published quizzes
  - `/quiz/[slug]` — full question-by-question quiz runner (client component),
    computes result client-side, saves an `attempts` row (with `user_id` if
    signed in, `null` if anonymous)
  - `/login` — "Continue with Google" button only
  - `/auth/callback` — OAuth code exchange route
  - `/account` — signed-in-only quiz history (redirects to `/login` if not
    authed); explicit `.eq("user_id", user.id)` filter as defense-in-depth on
    top of RLS
- `src/components/ad-slot.tsx` — placeholder `<AdSlot />` dropped on home + result
  screen for future ad monetization; subscriptions not designed yet
- `src/components/site-header.tsx` — nav with sign in / email+sign out

## Verified working

- `npx tsc --noEmit` and `npm run build` both clean
- Supabase publishable key confirmed valid (hit `/auth/v1/health`)
- Google OAuth flow confirmed working by the user in a real browser
- `0001_init.sql` → `0002_fix_attempts_rls.sql` → `seed.sql` confirmed run
  against the live Supabase project

## Open decisions / deferred

- Domain name: not purchased. Discussed `.io` (pricier, and carries long-term
  ccTLD risk since the UK ceded the British Indian Ocean Territory to Mauritius
  in 2024) vs a plain `.com`/`.app`/`.xyz`. Plan is to deploy to the free
  `*.vercel.app` subdomain first and buy a real domain later.
- Anonymous Supabase auth (so anonymous quiz-takers get a persistent history
  that can later link to a real account) — discussed, not built. Not needed:
  anonymous users can already take quizzes with zero login today, they just
  don't get a saved history unless they sign in.
- Ads/subscriptions: only a visual placeholder exists (`<AdSlot />`), no real
  ad network or payment integration yet.

## Next up

1. Vercel deployment prep (task was in progress, not started): add env vars to
   a Vercel project, connect the repo, do a first deploy to the `.vercel.app`
   subdomain.
2. Decide on a real domain once the site is live and happy.
