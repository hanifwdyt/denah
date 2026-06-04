# Denah Cloud Setup (Supabase)

Denah works fully offline as a **guest** (plans saved in your browser). Cloud
accounts + saved plans are optional. Enable them in ~5 minutes:

## 1. Create a Supabase project

Either:

- **Hosted (easiest):** sign up at <https://supabase.com> → **New project**. Pick a
  region close to your users and a strong DB password.
- **Self-host on Coolify:** deploy the official Supabase one-click stack, then
  use its API URL + anon key below.

## 2. Run the schema

Open **SQL Editor** in the Supabase dashboard, paste the contents of
[`schema.sql`](./schema.sql), and **Run**. This creates the `plans` table and the
Row Level Security policies (each user only sees their own plans). It's
idempotent — safe to re-run.

## 3. Enable Auth providers

In **Authentication → Providers**:

- **Email** — turn it on. For a smoother first run you can disable
  "Confirm email" (under Email settings) so sign-up logs the user straight in;
  otherwise users must click the confirmation link before logging in.
- **Google** (optional, for "Continue with Google"):
  1. Create an OAuth client in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
     (type: Web application).
  2. Add the Supabase callback as an **Authorized redirect URI**:
     `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`
  3. Paste the Client ID + Secret into Supabase → Google provider, enable it.
  4. In **Authentication → URL Configuration**, add your app origin(s) (e.g.
     `http://localhost:5180` and your production URL) to **Redirect URLs**.

## 4. Point Denah at your project

Copy `.env.example` to `.env` in the repo root and fill in the two values from
**Supabase → Settings → API**:

```bash
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Restart the dev server (`pnpm dev`) so Vite picks up the env vars. The
**Account** button now signs people in, and **My plans** saves/loads from the
cloud.

> If you skip this step the app still runs — it just stays in guest mode and the
> Account dialog shows a friendly "not configured" note.

## Notes

- The **anon key** is safe to ship to the browser; RLS (step 2) is what keeps each
  user's plans private. Never expose the `service_role` key in the frontend.
- A plan row stores the entire `DenahDoc` (`{ levels, activeLevelId, units }`) as
  JSONB, so multi-floor plans round-trip exactly.
