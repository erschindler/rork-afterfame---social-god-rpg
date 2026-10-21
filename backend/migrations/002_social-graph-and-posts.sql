CREATE TABLE IF NOT EXISTS public.simulated_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{2,24}$'),
  display_name text NOT NULL,
  bio text NOT NULL DEFAULT '',
  avatar_reference text NOT NULL,
  archetype text NOT NULL,
  personality_traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  interests text[] NOT NULL DEFAULT '{}',
  expertise text[] NOT NULL DEFAULT '{}',
  communication_style text NOT NULL,
  humor_style text NOT NULL,
  current_goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  fame real NOT NULL DEFAULT 0 CHECK (fame BETWEEN 0 AND 100),
  admiration real NOT NULL DEFAULT 50 CHECK (admiration BETWEEN 0 AND 100),
  infamy real NOT NULL DEFAULT 0 CHECK (infamy BETWEEN 0 AND 100),
  credibility real NOT NULL DEFAULT 50 CHECK (credibility BETWEEN 0 AND 100),
  influence real NOT NULL DEFAULT 0 CHECK (influence BETWEEN 0 AND 100),
  controversy real NOT NULL DEFAULT 0 CHECK (controversy BETWEEN 0 AND 100),
  audience_loyalty real NOT NULL DEFAULT 50 CHECK (audience_loyalty BETWEEN 0 AND 100),
  follower_count_cache integer NOT NULL DEFAULT 0 CHECK (follower_count_cache >= 0),
  following_count_cache integer NOT NULL DEFAULT 0 CHECK (following_count_cache >= 0),
  activity_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','dormant','suspended')),
  account_created_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, username),
  UNIQUE (world_id, seq)
);
CREATE INDEX IF NOT EXISTS sim_world_fame_idx ON public.simulated_accounts(world_id, fame DESC);
CREATE INDEX IF NOT EXISTS sim_interests_idx ON public.simulated_accounts USING gin (interests);
CREATE INDEX IF NOT EXISTS sim_search_idx ON public.simulated_accounts(world_id, lower(display_name) text_pattern_ops);

CREATE TABLE IF NOT EXISTS public.player_world_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 50),
  username text NOT NULL CHECK (username ~ '^[a-z0-9_]{3,20}$'),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  avatar_reference text NOT NULL,
  interests text[] NOT NULL DEFAULT '{}',
  starting_condition text NOT NULL DEFAULT 'ordinary' CHECK (starting_condition IN ('ordinary','niche','creator')),
  niche_topic text,
  fame real NOT NULL DEFAULT 0,
  admiration real NOT NULL DEFAULT 50,
  infamy real NOT NULL DEFAULT 0,
  credibility real NOT NULL DEFAULT 50,
  influence real NOT NULL DEFAULT 0,
  controversy real NOT NULL DEFAULT 0,
  audience_loyalty real NOT NULL DEFAULT 40,
  niche_authority real NOT NULL DEFAULT 0,
  connection_strength real NOT NULL DEFAULT 0,
  fatigue real NOT NULL DEFAULT 0,
  follower_count integer NOT NULL DEFAULT 0,
  following_count integer NOT NULL DEFAULT 0,
  post_count integer NOT NULL DEFAULT 0,
  total_reach integer NOT NULL DEFAULT 0,
  outside_reach integer NOT NULL DEFAULT 0,
  viral_posts integer NOT NULL DEFAULT 0,
  current_rank text NOT NULL DEFAULT 'Nobody',
  notoriety_rank text NOT NULL DEFAULT 'Unknown',
  career_identity text[] NOT NULL DEFAULT '{}',
  pinned_post_id uuid,
  public_stats boolean NOT NULL DEFAULT true,
  streak_days integer NOT NULL DEFAULT 0,
  last_streak_date date,
  last_action_at timestamptz,
  last_seen_at timestamptz,
  last_seen_tick integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, user_id),
  UNIQUE (world_id, username)
);

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('player','sim')),
  author_player_id uuid REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  author_simulated_account_id uuid REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  parent_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  root_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  quoted_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  post_type text NOT NULL DEFAULT 'post' CHECK (post_type IN ('post','reply','quote')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 560),
  topic_id text REFERENCES public.topics(id),
  stance text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'world' CHECK (visibility IN ('world','followers')),
  like_count integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  reply_count integer NOT NULL DEFAULT 0 CHECK (reply_count >= 0),
  repost_count integer NOT NULL DEFAULT 0 CHECK (repost_count >= 0),
  quote_count integer NOT NULL DEFAULT 0 CHECK (quote_count >= 0),
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  spread_stage text NOT NULL DEFAULT 'none',
  is_viral boolean NOT NULL DEFAULT false,
  sim_tick integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT posts_author_consistency CHECK (
    (author_type = 'player' AND author_player_id IS NOT NULL AND author_simulated_account_id IS NULL) OR
    (author_type = 'sim' AND author_simulated_account_id IS NOT NULL AND author_player_id IS NULL)
  ),
  CONSTRAINT posts_type_consistency CHECK ((post_type = 'reply' AND parent_post_id IS NOT NULL) OR (post_type <> 'reply'))
);
CREATE INDEX IF NOT EXISTS posts_world_created_idx ON public.posts(world_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS posts_parent_idx ON public.posts(parent_post_id, created_at);
CREATE INDEX IF NOT EXISTS posts_player_author_idx ON public.posts(author_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_sim_author_idx ON public.posts(author_simulated_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_topic_idx ON public.posts(world_id, topic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_content_search_idx ON public.posts USING gin (to_tsvector('english', content));

CREATE TABLE IF NOT EXISTS public.post_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor_type text NOT NULL CHECK (actor_type IN ('player','sim')),
  actor_player_id uuid REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  actor_simulated_account_id uuid REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  interaction_type text NOT NULL CHECK (interaction_type IN ('like','repost','bookmark','seen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pi_actor_consistency CHECK (
    (actor_type = 'player' AND actor_player_id IS NOT NULL AND actor_simulated_account_id IS NULL) OR
    (actor_type = 'sim' AND actor_simulated_account_id IS NOT NULL AND actor_player_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS pi_player_unique ON public.post_interactions(post_id, actor_player_id, interaction_type) WHERE actor_player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pi_sim_unique ON public.post_interactions(post_id, actor_simulated_account_id, interaction_type) WHERE actor_simulated_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pi_player_lookup ON public.post_interactions(actor_player_id, interaction_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  follower_type text NOT NULL CHECK (follower_type IN ('player','sim')),
  follower_player_id uuid REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  follower_simulated_account_id uuid REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  followed_type text NOT NULL CHECK (followed_type IN ('player','sim')),
  followed_player_id uuid REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  followed_simulated_account_id uuid REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follows_follower_consistency CHECK (
    (follower_type = 'player' AND follower_player_id IS NOT NULL AND follower_simulated_account_id IS NULL) OR
    (follower_type = 'sim' AND follower_simulated_account_id IS NOT NULL AND follower_player_id IS NULL)
  ),
  CONSTRAINT follows_followed_consistency CHECK (
    (followed_type = 'player' AND followed_player_id IS NOT NULL AND followed_simulated_account_id IS NULL) OR
    (followed_type = 'sim' AND followed_simulated_account_id IS NOT NULL AND followed_player_id IS NULL)
  ),
  CONSTRAINT follows_no_self CHECK (follower_player_id IS DISTINCT FROM followed_player_id OR follower_player_id IS NULL),
  CONSTRAINT follows_no_self_sim CHECK (follower_simulated_account_id IS DISTINCT FROM followed_simulated_account_id OR follower_simulated_account_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique_pair ON public.follows(world_id, coalesce(follower_player_id, follower_simulated_account_id), coalesce(followed_player_id, followed_simulated_account_id));
CREATE INDEX IF NOT EXISTS follows_followed_player_idx ON public.follows(followed_player_id);
CREATE INDEX IF NOT EXISTS follows_follower_player_idx ON public.follows(follower_player_id);
CREATE INDEX IF NOT EXISTS follows_followed_sim_idx ON public.follows(followed_simulated_account_id);
CREATE INDEX IF NOT EXISTS follows_follower_sim_idx ON public.follows(follower_simulated_account_id);

CREATE TABLE IF NOT EXISTS public.player_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_world_state(id) ON DELETE CASCADE,
  target_simulated_account_id uuid NOT NULL REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mute','block')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, target_simulated_account_id, kind)
);

CREATE TABLE IF NOT EXISTS public.relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  account_a_type text NOT NULL CHECK (account_a_type IN ('player','sim')),
  account_a_id uuid NOT NULL,
  account_b_type text NOT NULL CHECK (account_b_type IN ('player','sim')),
  account_b_id uuid NOT NULL,
  relationship_score real NOT NULL DEFAULT 0 CHECK (relationship_score BETWEEN -100 AND 100),
  peak_score real NOT NULL DEFAULT 0,
  relationship_status text NOT NULL DEFAULT 'acquaintance',
  interaction_count integer NOT NULL DEFAULT 0,
  hostile_count integer NOT NULL DEFAULT 0,
  last_interaction_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, account_a_type, account_a_id, account_b_type, account_b_id)
);
CREATE INDEX IF NOT EXISTS rel_a_idx ON public.relationships(world_id, account_a_id);
CREATE INDEX IF NOT EXISTS rel_b_idx ON public.relationships(world_id, account_b_id);

CREATE TABLE IF NOT EXISTS public.relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  relationship_id uuid NOT NULL REFERENCES public.relationships(id) ON DELETE CASCADE,
  delta real NOT NULL,
  new_score real NOT NULL,
  reason text NOT NULL,
  source_post_id uuid,
  source_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rel_events_rel_idx ON public.relationship_events(relationship_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.account_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  simulated_account_id uuid NOT NULL REFERENCES public.simulated_accounts(id) ON DELETE CASCADE,
  related_entity_type text NOT NULL,
  related_entity_id uuid,
  memory_type text NOT NULL,
  summary text NOT NULL,
  importance real NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
  sentiment real NOT NULL DEFAULT 0,
  source_event_id uuid,
  source_post_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS memories_lookup_idx ON public.account_memories(simulated_account_id, related_entity_id, occurred_at DESC);

ALTER TABLE public.simulated_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_world_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sim_member_read" ON public.simulated_accounts FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "pws_member_read" ON public.player_world_state FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "posts_member_read" ON public.posts FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "pi_member_read" ON public.post_interactions FOR SELECT TO authenticated USING (public.is_world_member(world_id) AND interaction_type <> 'bookmark' OR actor_player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
CREATE POLICY "follows_member_read" ON public.follows FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "filters_own_read" ON public.player_filters FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM public.player_world_state WHERE user_id = auth.uid()));
CREATE POLICY "rel_member_read" ON public.relationships FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "rel_events_member_read" ON public.relationship_events FOR SELECT TO authenticated USING (public.is_world_member(world_id));
CREATE POLICY "memories_member_read" ON public.account_memories FOR SELECT TO authenticated USING (public.is_world_member(world_id));
