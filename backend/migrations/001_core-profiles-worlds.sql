-- Applied via Rork runMigration. Source of truth for schema; keep in sync.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username text UNIQUE CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.topics (
  id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL
);
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "topics_read" ON public.topics;
CREATE POLICY "topics_read" ON public.topics FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  privacy_mode text NOT NULL DEFAULT 'private' CHECK (privacy_mode IN ('private','shared','circle')),
  world_pace text NOT NULL DEFAULT 'standard' CHECK (world_pace IN ('relaxed','standard','fast')),
  world_size text NOT NULL DEFAULT 'small' CHECK (world_size IN ('small','standard','large')),
  world_theme text NOT NULL DEFAULT 'mixed' CHECK (world_theme IN ('mainstream','gaming','tech','entertainment','politics','creator','underground','mixed')),
  seed bigint NOT NULL,
  status text NOT NULL DEFAULT 'initializing' CHECK (status IN ('initializing','ready','failed')),
  init_step text,
  current_tick integer NOT NULL DEFAULT 0,
  last_simulated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worlds_owner_idx ON public.worlds(owner_id);
CREATE INDEX IF NOT EXISTS worlds_sim_due_idx ON public.worlds(status, last_simulated_at);

CREATE TABLE IF NOT EXISTS public.world_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('owner','player','moderator')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, user_id)
);
CREATE INDEX IF NOT EXISTS world_members_user_idx ON public.world_members(user_id);

CREATE OR REPLACE FUNCTION public.is_world_member(w uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.world_members m WHERE m.world_id = w AND m.user_id = auth.uid() AND m.status = 'active');
$$;
REVOKE ALL ON FUNCTION public.is_world_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_world_member(uuid) TO authenticated;

ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "worlds_member_read" ON public.worlds;
CREATE POLICY "worlds_member_read" ON public.worlds FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_world_member(id));

ALTER TABLE public.world_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members_read" ON public.world_members;
CREATE POLICY "members_read" ON public.world_members FOR SELECT TO authenticated USING (public.is_world_member(world_id));

CREATE TABLE IF NOT EXISTS public.world_settings (
  world_id uuid PRIMARY KEY REFERENCES public.worlds(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  text_generation_mode text NOT NULL DEFAULT 'rules' CHECK (text_generation_mode IN ('rules','model')),
  notification_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.world_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_member_read" ON public.world_settings;
CREATE POLICY "settings_member_read" ON public.world_settings FOR SELECT TO authenticated USING (public.is_world_member(world_id));
