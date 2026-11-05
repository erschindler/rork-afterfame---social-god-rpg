-- 007: Living world — polls, multi-post threads, DMs, invites, realtime for posts/DMs.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS poll jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS thread_position integer;
CREATE INDEX IF NOT EXISTS posts_root_created_idx ON public.posts(root_post_id, created_at) WHERE deleted_at IS NULL;

ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS invite_code text;
CREATE UNIQUE INDEX IF NOT EXISTS worlds_invite_code_idx ON public.worlds(invite_code) WHERE invite_code IS NOT NULL;

-- Poll votes (player votes only; SIM votes are aggregated into posts.poll.counts)
CREATE TABLE IF NOT EXISTS public.poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  option_index integer NOT NULL CHECK (option_index BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, player_id)
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "poll_votes_own_read" ON public.poll_votes;
CREATE POLICY "poll_votes_own_read" ON public.poll_votes FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));

-- Direct messages between a player and a SIM
CREATE TABLE IF NOT EXISTS public.dm_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  sim_id uuid NOT NULL REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','request')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_preview text,
  last_sender text CHECK (last_sender IN ('player','sim')),
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  sim_typing_until timestamptz,
  player_last_read_at timestamptz,
  sim_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, sim_id)
);
CREATE INDEX IF NOT EXISTS dm_threads_player_idx ON public.dm_threads(player_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('player','sim')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','offer','system')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_messages_thread_idx ON public.dm_messages(thread_id, created_at);

ALTER TABLE public.dm_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dm_threads_own_read" ON public.dm_threads;
CREATE POLICY "dm_threads_own_read" ON public.dm_threads FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
DROP POLICY IF EXISTS "dm_messages_own_read" ON public.dm_messages;
CREATE POLICY "dm_messages_own_read" ON public.dm_messages FOR SELECT TO authenticated
  USING (thread_id IN (SELECT t.id FROM public.dm_threads t JOIN public.player_world_state p ON p.id = t.player_id WHERE p.user_id = auth.uid()));

-- Clients are read-only; edge functions (service role) write.
REVOKE INSERT, UPDATE, DELETE ON public.poll_votes, public.dm_threads, public.dm_messages FROM anon, authenticated;
GRANT SELECT ON public.poll_votes, public.dm_threads, public.dm_messages TO authenticated;

-- Realtime for live threads, new-post banners and DMs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'dm_threads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_threads;
  END IF;
END $$;
