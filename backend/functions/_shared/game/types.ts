import type { Traits } from "../sim/population.ts";

export interface WorldRow {
  id: string;
  owner_id: string;
  name: string;
  privacy_mode: "private" | "shared" | "circle";
  world_pace: "relaxed" | "standard" | "fast";
  world_size: "small" | "standard" | "large";
  world_theme: string;
  seed: number;
  status: "initializing" | "ready" | "failed";
  init_step: string | null;
  current_tick: number;
  last_simulated_at: string;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  world_id: string;
  user_id: string;
  display_name: string;
  username: string;
  bio: string;
  avatar_reference: string;
  interests: string[];
  starting_condition: string;
  niche_topic: string | null;
  fame: number;
  admiration: number;
  infamy: number;
  credibility: number;
  influence: number;
  controversy: number;
  audience_loyalty: number;
  niche_authority: number;
  connection_strength: number;
  fatigue: number;
  follower_count: number;
  following_count: number;
  post_count: number;
  total_reach: number;
  outside_reach: number;
  viral_posts: number;
  current_rank: string;
  notoriety_rank: string;
  career_identity: string[];
  streak_days: number;
  last_streak_date: string | null;
  last_action_at: string | null;
  last_seen_at: string | null;
  last_seen_tick: number;
  created_at: string;
}

export interface SimRow {
  id: string;
  world_id: string;
  seq: number;
  username: string;
  display_name: string;
  bio: string;
  avatar_reference: string;
  archetype: string;
  personality_traits: Traits;
  interests: string[];
  expertise: string[];
  communication_style: string;
  humor_style: string;
  current_goals: string[];
  fame: number;
  admiration: number;
  infamy: number;
  credibility: number;
  influence: number;
  controversy: number;
  audience_loyalty: number;
  follower_count_cache: number;
  following_count_cache: number;
  activity_profile: { postsPerDay: number; peakHour: number; window: number };
  account_status: string;
}

export interface PostRow {
  id: string;
  world_id: string;
  author_type: "player" | "sim";
  author_player_id: string | null;
  author_simulated_account_id: string | null;
  parent_post_id: string | null;
  root_post_id: string | null;
  quoted_post_id: string | null;
  post_type: "post" | "reply" | "quote";
  content: string;
  topic_id: string | null;
  stance: string | null;
  signals: Record<string, unknown>;
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  view_count: number;
  spread_stage: string;
  is_viral: boolean;
  sim_tick: number;
  created_at: string;
  deleted_at: string | null;
}

export const SIM_COLUMNS =
  "id, world_id, seq, username, display_name, bio, avatar_reference, archetype, personality_traits, interests, expertise, communication_style, humor_style, current_goals, fame, admiration, infamy, credibility, influence, controversy, audience_loyalty, follower_count_cache, following_count_cache, activity_profile, account_status";
