-- 008: response-bank usage ledger, on-device AI tasks for DMs, avatar uploads.

-- Response bank usage: how often each bank entry was used per world in the last 3 days.
CREATE TABLE IF NOT EXISTS public.response_usage (
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  entry_id text NOT NULL,
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, entry_id)
);
CREATE INDEX IF NOT EXISTS response_usage_recent_idx ON public.response_usage(world_id, last_used_at DESC);
ALTER TABLE public.response_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.response_usage FROM anon, authenticated;

-- Bump many entries at once; counts reset when the last use is older than 3 days.
CREATE OR REPLACE FUNCTION public.bump_response_usage(w uuid, ids text[], counts integer[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.response_usage AS r (world_id, entry_id, uses, last_used_at)
  SELECT w, i.id, i.n, now() FROM unnest(ids, counts) AS i(id, n)
  ON CONFLICT (world_id, entry_id) DO UPDATE
    SET uses = CASE WHEN r.last_used_at < now() - interval '3 days' THEN EXCLUDED.uses ELSE r.uses + EXCLUDED.uses END,
        last_used_at = now();
$$;
REVOKE ALL ON FUNCTION public.bump_response_usage(uuid, text[], integer[]) FROM public, anon, authenticated;

-- On-device AI: the server drafts a SIM reply, the player's browser rewrites it
-- with a local model and submits it. A fallback job publishes the draft if not.
CREATE TABLE IF NOT EXISTS public.local_ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.dm_threads(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  sim_id uuid NOT NULL,
  prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','fallback')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '40 seconds'
);
CREATE INDEX IF NOT EXISTS local_ai_tasks_thread_idx ON public.local_ai_tasks(thread_id, status);
ALTER TABLE public.local_ai_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "local_ai_own_read" ON public.local_ai_tasks;
CREATE POLICY "local_ai_own_read" ON public.local_ai_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.player_world_state p WHERE p.id = player_id AND p.user_id = auth.uid()));

-- Avatars: public read, each user writes only inside "<uid>/".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "avatars_own_insert" ON storage.objects;
CREATE POLICY "avatars_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars_own_update" ON storage.objects;
CREATE POLICY "avatars_own_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "avatars_own_delete" ON storage.objects;
CREATE POLICY "avatars_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
