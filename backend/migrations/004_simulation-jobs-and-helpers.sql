CREATE TABLE IF NOT EXISTS public.simulation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS jobs_due_idx ON public.simulation_jobs(world_id, status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.simulation_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  world_tick integer NOT NULL,
  checkpoint_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, world_tick)
);

CREATE TABLE IF NOT EXISTS public.app_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_secrets (name, value) VALUES ('cron_secret', encode(gen_random_bytes(32), 'hex')) ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.simulation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
REVOKE ALL ON public.simulation_jobs FROM anon, authenticated;
REVOKE ALL ON public.simulation_checkpoints FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_due_jobs(w uuid, lim integer)
RETURNS SETOF public.simulation_jobs LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.simulation_jobs j
  SET status = 'running', locked_at = now(), attempts = j.attempts + 1
  WHERE j.id IN (
    SELECT id FROM public.simulation_jobs
    WHERE world_id = w AND scheduled_at <= now() AND attempts < 3
      AND (status = 'pending' OR (status = 'running' AND locked_at < now() - interval '2 minutes'))
    ORDER BY scheduled_at
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.adjust_post_counts(p uuid, d_like integer, d_reply integer, d_repost integer, d_quote integer, d_view integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.posts SET
    like_count = GREATEST(0, like_count + d_like),
    reply_count = GREATEST(0, reply_count + d_reply),
    repost_count = GREATEST(0, repost_count + d_repost),
    quote_count = GREATEST(0, quote_count + d_quote),
    view_count = GREATEST(0, view_count + d_view),
    updated_at = now()
  WHERE id = p;
$$;

CREATE OR REPLACE FUNCTION public.refresh_player_counts(pid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.player_world_state SET
    follower_count = (SELECT count(*) FROM public.follows WHERE followed_player_id = pid),
    following_count = (SELECT count(*) FROM public.follows WHERE follower_player_id = pid),
    post_count = (SELECT count(*) FROM public.posts WHERE author_player_id = pid AND deleted_at IS NULL),
    updated_at = now()
  WHERE id = pid;
$$;

REVOKE ALL ON FUNCTION public.claim_due_jobs(uuid, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_post_counts(uuid, integer, integer, integer, integer, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_player_counts(uuid) FROM public, anon, authenticated;

-- Clients may read (via RLS) but never write authoritative tables directly.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['worlds','world_members','world_settings','simulated_accounts','player_world_state','posts','post_interactions','follows','player_filters','relationships','relationship_events','account_memories','world_events','event_effects','reputation_history','fame_snapshots','post_spread','trends','trend_posts','communities','community_memberships','notifications','achievements','player_achievements','daily_challenges','streak_history','moderation_reports','topics']
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
