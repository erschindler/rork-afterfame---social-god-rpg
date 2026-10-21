CREATE TABLE IF NOT EXISTS public.world_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  category text NOT NULL DEFAULT 'creator',
  title text NOT NULL,
  description text NOT NULL,
  severity integer NOT NULL DEFAULT 1 CHECK (severity BETWEEN 1 AND 5),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','player')),
  involves_player boolean NOT NULL DEFAULT false,
  source_entity_type text,
  source_entity_id uuid,
  related_account_ids uuid[] NOT NULL DEFAULT '{}',
  related_post_ids uuid[] NOT NULL DEFAULT '{}',
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','escalating','resolved','faded')),
  player_response text,
  sim_tick integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_world_idx ON public.world_events(world_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.event_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.world_events(id) ON DELETE CASCADE,
  target_entity_type text NOT NULL,
  target_entity_id uuid NOT NULL,
  effect_type text NOT NULL,
  previous_value real,
  new_value real,
  effect_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS effects_event_idx ON public.event_effects(event_id);

CREATE TABLE IF NOT EXISTS public.reputation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  attribute_name text NOT NULL,
  previous_value real NOT NULL,
  new_value real NOT NULL,
  delta real NOT NULL,
  reason text NOT NULL,
  source_event_id uuid,
  source_post_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rep_hist_idx ON public.reputation_history(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fame_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  sim_tick integer NOT NULL,
  fame real NOT NULL, admiration real NOT NULL, infamy real NOT NULL, credibility real NOT NULL,
  influence real NOT NULL, controversy real NOT NULL, followers integer NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fame_snap_idx ON public.fame_snapshots(player_id, created_at);

CREATE TABLE IF NOT EXISTS public.post_spread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  stage text NOT NULL,
  label text NOT NULL,
  detail text NOT NULL DEFAULT '',
  count integer NOT NULL DEFAULT 0,
  sim_tick integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, stage)
);

CREATE TABLE IF NOT EXISTS public.trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  topic_id text REFERENCES public.topics(id),
  category text NOT NULL DEFAULT 'culture',
  activity_score real NOT NULL DEFAULT 0,
  growth_rate real NOT NULL DEFAULT 0,
  decay_rate real NOT NULL DEFAULT 0.15,
  post_count integer NOT NULL DEFAULT 0,
  participant_count integer NOT NULL DEFAULT 0,
  origin_type text NOT NULL DEFAULT 'sim',
  origin_id uuid,
  status text NOT NULL DEFAULT 'emerging' CHECK (status IN ('emerging','rising','peak','declining','ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  peaked_at timestamptz,
  ended_at timestamptz,
  UNIQUE (world_id, slug)
);
CREATE INDEX IF NOT EXISTS trends_active_idx ON public.trends(world_id, status, activity_score DESC);

CREATE TABLE IF NOT EXISTS public.trend_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  trend_id uuid NOT NULL REFERENCES public.trends(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trend_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL,
  topic_id text REFERENCES public.topics(id),
  community_norms jsonb NOT NULL DEFAULT '{}'::jsonb,
  activity_score real NOT NULL DEFAULT 0,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, slug)
);

CREATE TABLE IF NOT EXISTS public.community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  member_type text NOT NULL CHECK (member_type IN ('player','sim')),
  player_id uuid REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  simulated_account_id uuid REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  standing real NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_member_consistency CHECK (
    (member_type = 'player' AND player_id IS NOT NULL AND simulated_account_id IS NULL) OR
    (member_type = 'sim' AND simulated_account_id IS NOT NULL AND player_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS cm_unique ON public.community_memberships(community_id, coalesce(player_id, simulated_account_id));
CREATE INDEX IF NOT EXISTS cm_sim_idx ON public.community_memberships(simulated_account_id);
CREATE INDEX IF NOT EXISTS cm_player_idx ON public.community_memberships(player_id);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  source_entity_type text,
  source_entity_id uuid,
  actor_ids uuid[] NOT NULL DEFAULT '{}',
  batch_key text,
  batch_count integer NOT NULL DEFAULT 1,
  priority integer NOT NULL DEFAULT 1,
  action_state text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notif_recipient_idx ON public.notifications(recipient_user_id, world_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS notif_batch_unique ON public.notifications(recipient_user_id, world_id, batch_key) WHERE batch_key IS NOT NULL AND read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements(id),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  source_event_id uuid,
  source_post_id uuid,
  is_public boolean NOT NULL DEFAULT true,
  UNIQUE (world_id, user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  challenge_date date NOT NULL,
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  target integer NOT NULL DEFAULT 1,
  progress integer NOT NULL DEFAULT 0,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  UNIQUE (player_id, challenge_date, code)
);

CREATE TABLE IF NOT EXISTS public.streak_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  streak_date date NOT NULL,
  streak_days integer NOT NULL,
  UNIQUE (player_id, streak_date)
);

CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_entity_type text NOT NULL,
  target_entity_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE public.world_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fame_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_spread ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_member_read" ON public.world_events FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "effects_member_read" ON public.event_effects FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "rep_own_read" ON public.reputation_history FOR SELECT TO authenticated USING (player_user_id = auth.uid());
CREATE POLICY "snap_own_read" ON public.fame_snapshots FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
CREATE POLICY "spread_member_read" ON public.post_spread FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "trends_member_read" ON public.trends FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "trend_posts_member_read" ON public.trend_posts FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "communities_member_read" ON public.communities FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "cm_member_read" ON public.community_memberships FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "notif_own_read" ON public.notifications FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());
CREATE POLICY "achievements_read" ON public.achievements FOR SELECT TO authenticated USING (is_active);
CREATE POLICY "pa_member_read" ON public.player_achievements FOR SELECT TO authenticated USING (user_id = auth.uid() OR (is_public AND public.is_world_member(world_id)));
CREATE POLICY "challenges_own_read" ON public.daily_challenges FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
CREATE POLICY "streak_own_read" ON public.streak_history FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
CREATE POLICY "reports_own_read" ON public.moderation_reports FOR SELECT TO authenticated USING (reporter_user_id = auth.uid());
