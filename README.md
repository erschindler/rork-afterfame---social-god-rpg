# AFTERFAME

**Post. Play. Be remembered.**

A social network simulation RPG. You start as nobody inside a persistent, simulated internet full of fictional people (all labeled `SIM`). Post, reply, follow, feud and collaborate. The world reacts through a deterministic simulation engine. You can become famous, loved, controversial, notorious or forgotten.

No paid AI is required. All gameplay runs on ordinary code and SQL. A language model is optional and only rewrites text.

---

## Architecture

```
web-afterfame/           React + TypeScript + Vite + Tailwind (the game client)
backend/
  functions/
    world/               create/initialize world, sync + catch-up, profile & settings
    social/              posts, replies, quotes, likes, reposts, follows, mutes, events, collabs
    feed/                feed ranking, threads, profiles, search, discover, sidebar
    simulate/            scheduled world simulation (called by pg_cron)
    _shared/sim/         PURE engine: rng, population, text, analysis, engagement,
                         reputation, relations, trends, optional LLM adapter (+ tests)
    _shared/game/        DB orchestration: init, distribution, tick, actions,
                         achievements, challenges, feed, persona, store
  migrations/            ordered SQL migrations (schema, RLS, seeds, cron)
  scripts/               api.sh, security-check.sh, calibrate.ts
  types.ts               generated DB types
```

**Authority.** The browser can only *read* through Row-Level Security (RLS). Every write that matters (posts, counters, follows, reputation, achievements, events) goes through Edge Functions using the service role. `INSERT/UPDATE/DELETE` are revoked from `anon` and `authenticated` on all game tables.

### How a post spreads
1. **Stage 1.** Initial exposure to your followers, people interested in the topic, community members, and anyone you mentioned.
2. Each candidate is evaluated separately: did they *notice* it, did they *react*, *how* did they react (like, reply stance, repost, quote), and what are the *consequences* (follow or unfollow, relationship change, memory).
3. **Stage 2 and 3.** These are queued jobs that run only if engagement earns them: second-degree audiences through reposters and quoters, then wider distribution.
4. **Shaping factors.** Diminishing returns, audience saturation, posting fatigue, community norms, memories and relationships all affect the outcome. A post can get zero engagement, and it can go viral.
5. **Logging.** Every attribute change is written to `reputation_history` with a reason. Spread stages are stored in `post_spread`.

### World time
- **Tick length** depends on pace: relaxed 30 min, standard 15 min, fast 5 min.
- **Cron.** `pg_cron` calls `simulate` every 5 minutes. It advances due worlds with bounded catch-up (max 6 ticks per sync), and runs even when nobody has the app open.
- **Idempotency.** Ticks are claimed with an optimistic `current_tick` check and a unique checkpoint per tick. Jobs are claimed with `FOR UPDATE SKIP LOCKED` and have unique idempotency keys, so retries are safe.
- **Independent life.** Accounts post, reply and quote. Feuds, reconciliations, breakouts, scandals, collaborations and platform news happen without you. Trends rise and decay.

---

## Setup (new Supabase project)

1. Create a Supabase project. Under **Auth → Providers**, enable Email. Configure SMTP for real users; the built-in mailer is heavily rate-limited.
2. **Migrations.** Run the files in `backend/migrations/` in numeric order (001 → 008), either in the SQL editor or with `psql`. Before running `006`, edit the function URL inside it to match your project ref.
3. **Deploy functions.**
   ```bash
   supabase functions deploy world --no-verify-jwt
   supabase functions deploy social --no-verify-jwt
   supabase functions deploy feed --no-verify-jwt
   supabase functions deploy simulate --no-verify-jwt
   ```
   The functions verify users themselves via `supabase.auth.getUser()`. `simulate` verifies a random secret stored in the private `app_secrets` table, which is created by migration 4.
4. **Optional model.** Set the `TEXT_MODEL_ENDPOINT`, `TEXT_MODEL_ID` and `TEXT_MODEL_API_KEY` secrets, then enable **World Settings → Use optional model**.
5. **Run the frontend.**
   ```bash
   cd web-afterfame
   cp ../.env.example .env   # fill EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
   bun install && bun run dev
   ```
6. **Deploy the frontend.** Run `bun run build` and serve `web-afterfame/dist` from any static host. Add your site URL to **Auth → URL configuration** so password-reset links work.

> In Rork, steps 1–6 are already done for this project. Migrations, functions, cron and auth settings are live.

## Testing

```bash
cd backend/functions && deno test _shared/               # 26 engine + response-bank tests
deno run backend/scripts/calibrate.ts                    # engagement-rate calibration table
OWNER_TOKEN=<jwt> WORLD_ID=<uuid> backend/scripts/security-check.sh   # 17 authorization checks
```

The engine tests cover: determinism, population consistency, zero-engagement posts, viral advancement, memory influence, personality-consistent reactions, controversy raising fame while lowering admiration, credibility recovery, diminishing returns, multi-condition ranks, trend rise and decay, text variety, and relationship states.

## Feature status

**Complete**
- **Accounts.** Email/password auth, session persistence, password reset, sign-out.
- **Worlds.** Private world creation with theme, size and pace, plus resumable idempotent initialization of 100, 500 or 1,500 people.
- **Persona.** Persona creation and three starting conditions.
- **Social actions.** Posts, replies, quote-posts, reposts, likes, bookmarks, follows (with follow-backs), mutes, blocks, reports and post deletion.
- **Feeds and search.** Feed filters (For You, Following, Trending, Latest, Communities, Bookmarks) with cursor pagination. Thread view with spread analysis. Discover and indexed search.
- **Simulation.** Multi-stage distribution, personality-driven reactions, relationships with history, account memories, and feuds you can start or join.
- **Reputation.** Six core attributes plus loyalty, niche authority, connections and fatigue. Explainable history, fame ranks, a parallel notoriety track, and inferred career identities.
- **Events and trends.** World events (player-driven and independent), event responses (apologize, stand firm, clarify, ignore), collaboration invites, emergent hashtag trends, and player-started trends.
- **Achievements and challenges.** 16 server-validated achievements. Daily challenges with forgiving streaks.
- **Notifications and time.** Notifications with batching and realtime toasts. Offline “While you were away” summaries built only from recorded events. Background simulation through cron.
- **Living conversations.** SIMs argue, agree, joke and pile on in multi-turn reply chains (dialogue acts stored per post), with nested thread views that update live.
- **Direct messages.** Inbox with Primary / Requests, typing indicators, read receipts, SIM replies in character, and brand deal offers you can accept or decline.
- **Polls and threads.** 2–4 option polls (1, 6 or 24 hours) that SIMs vote on, and multi-post threads of up to 6 parts.
- **Shared worlds.** Up to 8 players per world via invite links or codes; hosts can regenerate or turn off the link; members can leave.
- **Moderation review.** Reports are reviewed by the simulation within minutes and the reporter is notified. Real players are never auto-punished.
- **Live pulse.** Online players, active accounts, typing SIMs and a "new posts" pill on the home feed.
- **Response bank.** 54 dialogue acts, 491 trigger-tagged lines and 5,450 templates expand into about 21M filled replies (about 530M with voice styling). Per-world usage counters (`response_usage`, reset every 3 days) steer SIMs away from repeats; when a line is exhausted the bank recombines fresh text on the fly.
- **On-device AI (optional, free).** World Settings → On-device AI uses Chrome's built-in model or a WebLLM model (Qwen 2.5 0.5B / Llama 3.2 1B / Qwen 2.5 1.5B) running on WebGPU to rewrite SIM DM replies. The server always writes a draft first; if the browser doesn't answer within about 40 seconds, a fallback job sends the draft. Messages written on the device show an "On-device" label.
- **Avatars.** 16 illustrated styles with variations, or a photo from the library or camera, cropped to 512×512 and stored in the public `avatars` bucket (each user writes only to their own folder).
- **Fictional ads.** 50 made-up brands produce 21,600 ad variations, targeted by interests and rotated so recent ones don't repeat. Each brand has its own fake website (`/w/:id/site/:brand`) with a cart that never charges. Players can hide ads or brands and see a joke "Why this ad".
- **Alerts.** Realtime pop-ups with Open or Reply actions for DMs, replies and mentions, an optional system notification when the tab is hidden, a WebAudio chime, and the unread count in the tab title. Preferences are stored per device.
- **Interface.** Dark (default) and light themes, a responsive desktop three-column layout, mobile bottom navigation, keyboard shortcuts (press `?`), DM smart replies and draft autosave.

**Deferred**
- Image attachments.
- Private circles (invite-only worlds without a public code).
