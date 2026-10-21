/* eslint-disable */
// AUTO-GENERATED — DO NOT EDIT
// Run migrations to regenerate.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_memories: {
        Row: {
          created_at: string
          id: string
          importance: number
          memory_type: string
          occurred_at: string
          related_entity_id: string | null
          related_entity_type: string
          sentiment: number
          simulated_account_id: string
          source_event_id: string | null
          source_post_id: string | null
          summary: string
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          importance?: number
          memory_type: string
          occurred_at?: string
          related_entity_id?: string | null
          related_entity_type: string
          sentiment?: number
          simulated_account_id: string
          source_event_id?: string | null
          source_post_id?: string | null
          summary: string
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          importance?: number
          memory_type?: string
          occurred_at?: string
          related_entity_id?: string | null
          related_entity_type?: string
          sentiment?: number
          simulated_account_id?: string
          source_event_id?: string | null
          source_post_id?: string | null
          summary?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_memories_simulated_account_id_fkey"
            columns: ["simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_memories_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          category: string
          code: string
          description: string
          id: string
          is_active: boolean
          name: string
          requirements: Json
          sort_order: number
        }
        Insert: {
          category: string
          code: string
          description: string
          id?: string
          is_active?: boolean
          name: string
          requirements?: Json
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          requirements?: Json
          sort_order?: number
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      communities: {
        Row: {
          activity_score: number
          community_norms: Json
          created_at: string
          description: string
          id: string
          member_count: number
          name: string
          slug: string
          topic_id: string | null
          world_id: string
        }
        Insert: {
          activity_score?: number
          community_norms?: Json
          created_at?: string
          description: string
          id?: string
          member_count?: number
          name: string
          slug: string
          topic_id?: string | null
          world_id: string
        }
        Update: {
          activity_score?: number
          community_norms?: Json
          created_at?: string
          description?: string
          id?: string
          member_count?: number
          name?: string
          slug?: string
          topic_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      community_memberships: {
        Row: {
          community_id: string
          id: string
          joined_at: string
          member_type: string
          player_id: string | null
          role: string
          simulated_account_id: string | null
          standing: number
          world_id: string
        }
        Insert: {
          community_id: string
          id?: string
          joined_at?: string
          member_type: string
          player_id?: string | null
          role?: string
          simulated_account_id?: string | null
          standing?: number
          world_id: string
        }
        Update: {
          community_id?: string
          id?: string
          joined_at?: string
          member_type?: string
          player_id?: string | null
          role?: string
          simulated_account_id?: string | null
          standing?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_simulated_account_id_fkey"
            columns: ["simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_challenges: {
        Row: {
          challenge_date: string
          code: string
          completed_at: string | null
          description: string
          id: string
          params: Json
          player_id: string
          progress: number
          target: number
          title: string
          world_id: string
        }
        Insert: {
          challenge_date: string
          code: string
          completed_at?: string | null
          description: string
          id?: string
          params?: Json
          player_id: string
          progress?: number
          target?: number
          title: string
          world_id: string
        }
        Update: {
          challenge_date?: string
          code?: string
          completed_at?: string | null
          description?: string
          id?: string
          params?: Json
          player_id?: string
          progress?: number
          target?: number
          title?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_challenges_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_challenges_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      event_effects: {
        Row: {
          created_at: string
          effect_data: Json
          effect_type: string
          event_id: string
          id: string
          new_value: number | null
          previous_value: number | null
          target_entity_id: string
          target_entity_type: string
          world_id: string
        }
        Insert: {
          created_at?: string
          effect_data?: Json
          effect_type: string
          event_id: string
          id?: string
          new_value?: number | null
          previous_value?: number | null
          target_entity_id: string
          target_entity_type: string
          world_id: string
        }
        Update: {
          created_at?: string
          effect_data?: Json
          effect_type?: string
          event_id?: string
          id?: string
          new_value?: number | null
          previous_value?: number | null
          target_entity_id?: string
          target_entity_type?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_effects_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "world_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_effects_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      fame_snapshots: {
        Row: {
          admiration: number
          controversy: number
          created_at: string
          credibility: number
          fame: number
          followers: number
          id: string
          infamy: number
          influence: number
          label: string | null
          player_id: string
          sim_tick: number
          world_id: string
        }
        Insert: {
          admiration: number
          controversy: number
          created_at?: string
          credibility: number
          fame: number
          followers: number
          id?: string
          infamy: number
          influence: number
          label?: string | null
          player_id: string
          sim_tick: number
          world_id: string
        }
        Update: {
          admiration?: number
          controversy?: number
          created_at?: string
          credibility?: number
          fame?: number
          followers?: number
          id?: string
          infamy?: number
          influence?: number
          label?: string | null
          player_id?: string
          sim_tick?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fame_snapshots_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fame_snapshots_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_player_id: string | null
          followed_simulated_account_id: string | null
          followed_type: string
          follower_player_id: string | null
          follower_simulated_account_id: string | null
          follower_type: string
          id: string
          reason: string | null
          world_id: string
        }
        Insert: {
          created_at?: string
          followed_player_id?: string | null
          followed_simulated_account_id?: string | null
          followed_type: string
          follower_player_id?: string | null
          follower_simulated_account_id?: string | null
          follower_type: string
          id?: string
          reason?: string | null
          world_id: string
        }
        Update: {
          created_at?: string
          followed_player_id?: string | null
          followed_simulated_account_id?: string | null
          followed_type?: string
          follower_player_id?: string | null
          follower_simulated_account_id?: string | null
          follower_type?: string
          id?: string
          reason?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followed_player_id_fkey"
            columns: ["followed_player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_followed_simulated_account_id_fkey"
            columns: ["followed_simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_player_id_fkey"
            columns: ["follower_player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_simulated_account_id_fkey"
            columns: ["follower_simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_user_id: string
          reviewed_at: string | null
          status: string
          target_entity_id: string
          target_entity_type: string
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_user_id: string
          reviewed_at?: string | null
          status?: string
          target_entity_id: string
          target_entity_type: string
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_user_id?: string
          reviewed_at?: string | null
          status?: string
          target_entity_id?: string
          target_entity_type?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_reports_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_state: string | null
          actor_ids: string[]
          batch_count: number
          batch_key: string | null
          body: string
          created_at: string
          id: string
          notification_type: string
          priority: number
          read_at: string | null
          recipient_user_id: string
          source_entity_id: string | null
          source_entity_type: string | null
          title: string
          world_id: string
        }
        Insert: {
          action_state?: string | null
          actor_ids?: string[]
          batch_count?: number
          batch_key?: string | null
          body?: string
          created_at?: string
          id?: string
          notification_type: string
          priority?: number
          read_at?: string | null
          recipient_user_id: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          title: string
          world_id: string
        }
        Update: {
          action_state?: string | null
          actor_ids?: string[]
          batch_count?: number
          batch_key?: string | null
          body?: string
          created_at?: string
          id?: string
          notification_type?: string
          priority?: number
          read_at?: string | null
          recipient_user_id?: string
          source_entity_id?: string | null
          source_entity_type?: string | null
          title?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_achievements: {
        Row: {
          achievement_id: string
          id: string
          is_public: boolean
          player_id: string
          source_event_id: string | null
          source_post_id: string | null
          unlocked_at: string
          user_id: string
          world_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          is_public?: boolean
          player_id: string
          source_event_id?: string | null
          source_post_id?: string | null
          unlocked_at?: string
          user_id: string
          world_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          is_public?: boolean
          player_id?: string
          source_event_id?: string | null
          source_post_id?: string | null
          unlocked_at?: string
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_achievements_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_filters: {
        Row: {
          created_at: string
          id: string
          kind: string
          player_id: string
          target_simulated_account_id: string
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          player_id: string
          target_simulated_account_id: string
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          player_id?: string
          target_simulated_account_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_filters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_filters_target_simulated_account_id_fkey"
            columns: ["target_simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_filters_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      player_world_state: {
        Row: {
          admiration: number
          audience_loyalty: number
          avatar_reference: string
          bio: string
          career_identity: string[]
          connection_strength: number
          controversy: number
          created_at: string
          credibility: number
          current_rank: string
          display_name: string
          fame: number
          fatigue: number
          follower_count: number
          following_count: number
          id: string
          infamy: number
          influence: number
          interests: string[]
          last_action_at: string | null
          last_seen_at: string | null
          last_seen_tick: number
          last_streak_date: string | null
          niche_authority: number
          niche_topic: string | null
          notoriety_rank: string
          outside_reach: number
          pinned_post_id: string | null
          post_count: number
          public_stats: boolean
          starting_condition: string
          streak_days: number
          total_reach: number
          updated_at: string
          user_id: string
          username: string
          viral_posts: number
          world_id: string
        }
        Insert: {
          admiration?: number
          audience_loyalty?: number
          avatar_reference: string
          bio?: string
          career_identity?: string[]
          connection_strength?: number
          controversy?: number
          created_at?: string
          credibility?: number
          current_rank?: string
          display_name: string
          fame?: number
          fatigue?: number
          follower_count?: number
          following_count?: number
          id?: string
          infamy?: number
          influence?: number
          interests?: string[]
          last_action_at?: string | null
          last_seen_at?: string | null
          last_seen_tick?: number
          last_streak_date?: string | null
          niche_authority?: number
          niche_topic?: string | null
          notoriety_rank?: string
          outside_reach?: number
          pinned_post_id?: string | null
          post_count?: number
          public_stats?: boolean
          starting_condition?: string
          streak_days?: number
          total_reach?: number
          updated_at?: string
          user_id: string
          username: string
          viral_posts?: number
          world_id: string
        }
        Update: {
          admiration?: number
          audience_loyalty?: number
          avatar_reference?: string
          bio?: string
          career_identity?: string[]
          connection_strength?: number
          controversy?: number
          created_at?: string
          credibility?: number
          current_rank?: string
          display_name?: string
          fame?: number
          fatigue?: number
          follower_count?: number
          following_count?: number
          id?: string
          infamy?: number
          influence?: number
          interests?: string[]
          last_action_at?: string | null
          last_seen_at?: string | null
          last_seen_tick?: number
          last_streak_date?: string | null
          niche_authority?: number
          niche_topic?: string | null
          notoriety_rank?: string
          outside_reach?: number
          pinned_post_id?: string | null
          post_count?: number
          public_stats?: boolean
          starting_condition?: string
          streak_days?: number
          total_reach?: number
          updated_at?: string
          user_id?: string
          username?: string
          viral_posts?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_world_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_world_state_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      post_interactions: {
        Row: {
          actor_player_id: string | null
          actor_simulated_account_id: string | null
          actor_type: string
          created_at: string
          id: string
          interaction_type: string
          post_id: string
          world_id: string
        }
        Insert: {
          actor_player_id?: string | null
          actor_simulated_account_id?: string | null
          actor_type: string
          created_at?: string
          id?: string
          interaction_type: string
          post_id: string
          world_id: string
        }
        Update: {
          actor_player_id?: string | null
          actor_simulated_account_id?: string | null
          actor_type?: string
          created_at?: string
          id?: string
          interaction_type?: string
          post_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_interactions_actor_player_id_fkey"
            columns: ["actor_player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_interactions_actor_simulated_account_id_fkey"
            columns: ["actor_simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_interactions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      post_spread: {
        Row: {
          count: number
          created_at: string
          detail: string
          id: string
          label: string
          post_id: string
          sim_tick: number
          stage: string
          world_id: string
        }
        Insert: {
          count?: number
          created_at?: string
          detail?: string
          id?: string
          label: string
          post_id: string
          sim_tick?: number
          stage: string
          world_id: string
        }
        Update: {
          count?: number
          created_at?: string
          detail?: string
          id?: string
          label?: string
          post_id?: string
          sim_tick?: number
          stage?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_spread_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_spread_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_player_id: string | null
          author_simulated_account_id: string | null
          author_type: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_viral: boolean
          like_count: number
          parent_post_id: string | null
          post_type: string
          quote_count: number
          quoted_post_id: string | null
          reply_count: number
          repost_count: number
          root_post_id: string | null
          signals: Json
          sim_tick: number
          spread_stage: string
          stance: string | null
          topic_id: string | null
          updated_at: string
          view_count: number
          visibility: string
          world_id: string
        }
        Insert: {
          author_player_id?: string | null
          author_simulated_account_id?: string | null
          author_type: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_viral?: boolean
          like_count?: number
          parent_post_id?: string | null
          post_type?: string
          quote_count?: number
          quoted_post_id?: string | null
          reply_count?: number
          repost_count?: number
          root_post_id?: string | null
          signals?: Json
          sim_tick?: number
          spread_stage?: string
          stance?: string | null
          topic_id?: string | null
          updated_at?: string
          view_count?: number
          visibility?: string
          world_id: string
        }
        Update: {
          author_player_id?: string | null
          author_simulated_account_id?: string | null
          author_type?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_viral?: boolean
          like_count?: number
          parent_post_id?: string | null
          post_type?: string
          quote_count?: number
          quoted_post_id?: string | null
          reply_count?: number
          repost_count?: number
          root_post_id?: string | null
          signals?: Json
          sim_tick?: number
          spread_stage?: string
          stance?: string | null
          topic_id?: string | null
          updated_at?: string
          view_count?: number
          visibility?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_player_id_fkey"
            columns: ["author_player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_simulated_account_id_fkey"
            columns: ["author_simulated_account_id"]
            isOneToOne: false
            referencedRelation: "simulated_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_quoted_post_id_fkey"
            columns: ["quoted_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_root_post_id_fkey"
            columns: ["root_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      relationship_events: {
        Row: {
          created_at: string
          delta: number
          id: string
          new_score: number
          reason: string
          relationship_id: string
          source_event_id: string | null
          source_post_id: string | null
          world_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          new_score: number
          reason: string
          relationship_id: string
          source_event_id?: string | null
          source_post_id?: string | null
          world_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          new_score?: number
          reason?: string
          relationship_id?: string
          source_event_id?: string | null
          source_post_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_events_relationship_id_fkey"
            columns: ["relationship_id"]
            isOneToOne: false
            referencedRelation: "relationships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationship_events_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      relationships: {
        Row: {
          account_a_id: string
          account_a_type: string
          account_b_id: string
          account_b_type: string
          hostile_count: number
          id: string
          interaction_count: number
          last_interaction_at: string | null
          peak_score: number
          relationship_score: number
          relationship_status: string
          updated_at: string
          world_id: string
        }
        Insert: {
          account_a_id: string
          account_a_type: string
          account_b_id: string
          account_b_type: string
          hostile_count?: number
          id?: string
          interaction_count?: number
          last_interaction_at?: string | null
          peak_score?: number
          relationship_score?: number
          relationship_status?: string
          updated_at?: string
          world_id: string
        }
        Update: {
          account_a_id?: string
          account_a_type?: string
          account_b_id?: string
          account_b_type?: string
          hostile_count?: number
          id?: string
          interaction_count?: number
          last_interaction_at?: string | null
          peak_score?: number
          relationship_score?: number
          relationship_status?: string
          updated_at?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationships_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_history: {
        Row: {
          attribute_name: string
          created_at: string
          delta: number
          id: string
          new_value: number
          player_id: string
          player_user_id: string
          previous_value: number
          reason: string
          source_event_id: string | null
          source_post_id: string | null
          world_id: string
        }
        Insert: {
          attribute_name: string
          created_at?: string
          delta: number
          id?: string
          new_value: number
          player_id: string
          player_user_id: string
          previous_value: number
          reason: string
          source_event_id?: string | null
          source_post_id?: string | null
          world_id: string
        }
        Update: {
          attribute_name?: string
          created_at?: string
          delta?: number
          id?: string
          new_value?: number
          player_id?: string
          player_user_id?: string
          previous_value?: number
          reason?: string
          source_event_id?: string | null
          source_post_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reputation_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_history_player_user_id_fkey"
            columns: ["player_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_history_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      simulated_accounts: {
        Row: {
          account_created_at: string
          account_status: string
          activity_profile: Json
          admiration: number
          archetype: string
          audience_loyalty: number
          avatar_reference: string
          bio: string
          communication_style: string
          controversy: number
          created_at: string
          credibility: number
          current_goals: Json
          display_name: string
          expertise: string[]
          fame: number
          follower_count_cache: number
          following_count_cache: number
          humor_style: string
          id: string
          infamy: number
          influence: number
          interests: string[]
          personality_traits: Json
          seq: number
          updated_at: string
          username: string
          world_id: string
        }
        Insert: {
          account_created_at?: string
          account_status?: string
          activity_profile?: Json
          admiration?: number
          archetype: string
          audience_loyalty?: number
          avatar_reference: string
          bio?: string
          communication_style: string
          controversy?: number
          created_at?: string
          credibility?: number
          current_goals?: Json
          display_name: string
          expertise?: string[]
          fame?: number
          follower_count_cache?: number
          following_count_cache?: number
          humor_style: string
          id?: string
          infamy?: number
          influence?: number
          interests?: string[]
          personality_traits?: Json
          seq: number
          updated_at?: string
          username: string
          world_id: string
        }
        Update: {
          account_created_at?: string
          account_status?: string
          activity_profile?: Json
          admiration?: number
          archetype?: string
          audience_loyalty?: number
          avatar_reference?: string
          bio?: string
          communication_style?: string
          controversy?: number
          created_at?: string
          credibility?: number
          current_goals?: Json
          display_name?: string
          expertise?: string[]
          fame?: number
          follower_count_cache?: number
          following_count_cache?: number
          humor_style?: string
          id?: string
          infamy?: number
          influence?: number
          interests?: string[]
          personality_traits?: Json
          seq?: number
          updated_at?: string
          username?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulated_accounts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_checkpoints: {
        Row: {
          checkpoint_data: Json
          created_at: string
          id: string
          world_id: string
          world_tick: number
        }
        Insert: {
          checkpoint_data?: Json
          created_at?: string
          id?: string
          world_id: string
          world_tick: number
        }
        Update: {
          checkpoint_data?: Json
          created_at?: string
          id?: string
          world_id?: string
          world_tick?: number
        }
        Relationships: [
          {
            foreignKeyName: "simulation_checkpoints_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      simulation_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          scheduled_at: string
          status: string
          world_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          scheduled_at?: string
          status?: string
          world_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          scheduled_at?: string
          status?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_jobs_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      streak_history: {
        Row: {
          id: string
          player_id: string
          streak_date: string
          streak_days: number
          world_id: string
        }
        Insert: {
          id?: string
          player_id: string
          streak_date: string
          streak_days: number
          world_id: string
        }
        Update: {
          id?: string
          player_id?: string
          streak_date?: string
          streak_days?: number
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streak_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_world_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streak_history_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          category: string
          id: string
          name: string
        }
        Insert: {
          category: string
          id: string
          name: string
        }
        Update: {
          category?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      trend_posts: {
        Row: {
          created_at: string
          id: string
          post_id: string
          trend_id: string
          world_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          trend_id: string
          world_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          trend_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_posts_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trend_posts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          activity_score: number
          category: string
          decay_rate: number
          description: string
          ended_at: string | null
          growth_rate: number
          id: string
          name: string
          origin_id: string | null
          origin_type: string
          participant_count: number
          peaked_at: string | null
          post_count: number
          slug: string
          started_at: string
          status: string
          topic_id: string | null
          world_id: string
        }
        Insert: {
          activity_score?: number
          category?: string
          decay_rate?: number
          description?: string
          ended_at?: string | null
          growth_rate?: number
          id?: string
          name: string
          origin_id?: string | null
          origin_type?: string
          participant_count?: number
          peaked_at?: string | null
          post_count?: number
          slug: string
          started_at?: string
          status?: string
          topic_id?: string | null
          world_id: string
        }
        Update: {
          activity_score?: number
          category?: string
          decay_rate?: number
          description?: string
          ended_at?: string | null
          growth_rate?: number
          id?: string
          name?: string
          origin_id?: string | null
          origin_type?: string
          participant_count?: number
          peaked_at?: string | null
          post_count?: number
          slug?: string
          started_at?: string
          status?: string
          topic_id?: string | null
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trends_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trends_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      world_events: {
        Row: {
          category: string
          created_at: string
          description: string
          ended_at: string | null
          event_data: Json
          event_type: string
          id: string
          involves_player: boolean
          player_response: string | null
          related_account_ids: string[]
          related_post_ids: string[]
          severity: number
          sim_tick: number
          source_entity_id: string | null
          source_entity_type: string | null
          started_at: string
          status: string
          title: string
          visibility: string
          world_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          ended_at?: string | null
          event_data?: Json
          event_type: string
          id?: string
          involves_player?: boolean
          player_response?: string | null
          related_account_ids?: string[]
          related_post_ids?: string[]
          severity?: number
          sim_tick?: number
          source_entity_id?: string | null
          source_entity_type?: string | null
          started_at?: string
          status?: string
          title: string
          visibility?: string
          world_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          ended_at?: string | null
          event_data?: Json
          event_type?: string
          id?: string
          involves_player?: boolean
          player_response?: string | null
          related_account_ids?: string[]
          related_post_ids?: string[]
          severity?: number
          sim_tick?: number
          source_entity_id?: string | null
          source_entity_type?: string | null
          started_at?: string
          status?: string
          title?: string
          visibility?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_events_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      world_members: {
        Row: {
          id: string
          joined_at: string
          role: string
          status: string
          user_id: string
          world_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
          world_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_members_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      world_settings: {
        Row: {
          notification_preferences: Json
          settings: Json
          text_generation_mode: string
          updated_at: string
          world_id: string
        }
        Insert: {
          notification_preferences?: Json
          settings?: Json
          text_generation_mode?: string
          updated_at?: string
          world_id: string
        }
        Update: {
          notification_preferences?: Json
          settings?: Json
          text_generation_mode?: string
          updated_at?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_settings_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: true
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      worlds: {
        Row: {
          created_at: string
          current_tick: number
          id: string
          init_step: string | null
          last_simulated_at: string
          name: string
          owner_id: string
          privacy_mode: string
          seed: number
          status: string
          updated_at: string
          world_pace: string
          world_size: string
          world_theme: string
        }
        Insert: {
          created_at?: string
          current_tick?: number
          id?: string
          init_step?: string | null
          last_simulated_at?: string
          name: string
          owner_id: string
          privacy_mode?: string
          seed: number
          status?: string
          updated_at?: string
          world_pace?: string
          world_size?: string
          world_theme?: string
        }
        Update: {
          created_at?: string
          current_tick?: number
          id?: string
          init_step?: string | null
          last_simulated_at?: string
          name?: string
          owner_id?: string
          privacy_mode?: string
          seed?: number
          status?: string
          updated_at?: string
          world_pace?: string
          world_size?: string
          world_theme?: string
        }
        Relationships: [
          {
            foreignKeyName: "worlds_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_post_counts: {
        Args: {
          d_like: number
          d_quote: number
          d_reply: number
          d_repost: number
          d_view: number
          p: string
        }
        Returns: undefined
      }
      claim_due_jobs: {
        Args: { lim: number; w: string }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          payload: Json
          scheduled_at: string
          status: string
          world_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "simulation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_world_member: { Args: { w: string }; Returns: boolean }
      refresh_player_counts: { Args: { pid: string }; Returns: undefined }
      trigger_world_simulation: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
