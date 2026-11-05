/** Domain types mirroring server responses. */

export interface AuthorView {
  kind: "sim" | "player";
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  bio: string;
  is_simulated: boolean;
  is_self: boolean;
  label: string;
  followers: number;
  fame?: number;
}

export interface PostBase {
  id: string;
  post_type: "post" | "reply" | "quote";
  content: string;
  topic_id: string | null;
  created_at: string;
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  view_count: number;
  is_viral: boolean;
  spread_stage: string;
  stance: string | null;
  author: AuthorView;
}

export interface PollView {
  options: string[];
  counts: number[];
  total: number;
  closes_at: string;
  closed: boolean;
  viewer_vote: number | null;
  is_own: boolean;
}

export interface PostView extends PostBase {
  parent: { id: string; username: string } | null;
  quoted: PostBase | null;
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean };
  poll?: PollView | null;
  thread_position?: number | null;
  children?: PostView[];
}

export interface WorldEventRow {
  id: string;
  event_type: string;
  category: string;
  title: string;
  description: string;
  severity: number;
  status: string;
  involves_player: boolean;
  started_at: string;
  player_response?: string | null;
  event_data?: { choices?: string[]; counterpart?: string; topic?: string } | null;
  related_account_ids?: string[];
  related_post_ids?: string[];
}

export interface FeedItem {
  kind: "post" | "event";
  post?: PostView;
  event?: WorldEventRow;
}

export interface RankRequirement {
  label: string;
  current: number;
  target: number;
  met: boolean;
}

export interface RankInfo {
  rank: string;
  index: number;
  next: string | null;
  requirements: RankRequirement[];
  progress: number;
}

export interface PlayerState {
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
  public_stats: boolean;
  pinned_post_id: string | null;
  streak_days: number;
  created_at: string;
}

export interface WorldState {
  id: string;
  owner_id: string;
  name: string;
  privacy_mode: string;
  world_pace: "relaxed" | "standard" | "fast";
  world_size: "small" | "standard" | "large";
  world_theme: string;
  current_tick: number;
  last_simulated_at: string;
  created_at: string;
  population: number;
  invite_code?: string | null;
  isOwner?: boolean;
}

export interface OfflineSummary {
  away: string;
  items: { id: string; title: string; description: string; event_type: string; involves_player: boolean; started_at: string }[];
  unread: number;
}

export interface SyncResponse {
  world: WorldState;
  player: PlayerState;
  rank: RankInfo;
  unread: number;
  unreadDms?: number;
  summary: OfflineSummary | null;
}

export interface AccountCard {
  kind: "sim" | "player";
  id: string;
  username: string;
  display_name: string;
  avatar: string;
  bio: string;
  followers: number;
  label: string;
  is_simulated: boolean;
}

export interface TrendRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  post_count: number;
  activity_score: number;
  topic_id?: string | null;
  participant_count?: number;
  origin_type?: string;
}

export interface ChallengeRow {
  id: string;
  code: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed_at: string | null;
}

export interface CommunityRow {
  id: string;
  name: string;
  slug: string;
  description?: string;
  member_count: number;
  activity_score?: number;
  topic_id: string | null;
  community_norms?: { prefers?: string[]; dislikes?: string[]; summary?: string };
}

export interface SidebarData {
  trends: TrendRow[];
  suggestions: AccountCard[];
  challenges: ChallengeRow[];
  events: WorldEventRow[];
  debates: { id: string; content: string; reply_count: number; quote_count: number; topic_id: string }[];
  communities: CommunityRow[];
  rank: RankInfo;
}

export interface SpreadRow {
  stage: string;
  label: string;
  detail: string;
  count: number;
  created_at: string;
}

export interface ThreadResponse {
  post: PostView;
  ancestors: PostView[];
  replies: PostView[];
  replyTotal?: number;
  quotes: PostView[];
  spread: SpreadRow[];
  comparison: string | null;
  ancestorsMissing: boolean;
}

export interface NotificationRow {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  actor_ids: string[];
  batch_count: number;
  priority: number;
  action_state: string | null;
  read_at: string | null;
  created_at: string;
}

export interface DmSim {
  id: string;
  username: string;
  display_name: string;
  avatar_reference: string;
  archetype?: string;
  follower_count_cache?: number;
  bio?: string;
}

export interface DmThread {
  id: string;
  sim_id: string;
  status: string;
  last_message_at: string;
  last_preview: string;
  last_sender: "player" | "sim";
  unread_count: number;
  sim_typing_until: string | null;
  sim_last_read_at: string | null;
  player_last_read_at: string | null;
  typing?: boolean;
  sim?: DmSim | null;
}

export interface DmMessage {
  id: string;
  thread_id: string;
  sender_type: "player" | "sim";
  content: string;
  kind: "text" | "offer" | "invite" | "system";
  meta: { status?: "pending" | "accepted" | "declined"; fee?: number; brand?: string; [k: string]: unknown };
  created_at: string;
}

export interface DmListResponse {
  threads: DmThread[];
  unread: number;
}

export interface DmThreadResponse {
  thread: DmThread | null;
  sim: DmSim;
  messages: DmMessage[];
  relationship: { relationship_score: number; relationship_status: string } | null;
  localTask?: DmLocalTask | null;
}

export interface DmLocalTask {
  id: string;
  draft: string[];
  expiresAt: string;
  prompt: {
    username: string;
    display_name: string;
    archetype: string;
    style: string;
    bio?: string;
    interests?: string[];
    relationship?: number;
    player: string;
    history: { from: string; text: string }[];
  };
}

export interface PulseResponse {
  online_players: number;
  active_accounts: number;
  new_posts: number;
  typing: { id: string; sim_id: string }[];
  unread_dms: number;
  now: string;
}

export interface ReportRow {
  id: string;
  target_entity_type: "post" | "sim" | "player";
  target_entity_id: string;
  reason: string;
  status: "open" | "reviewed" | "dismissed" | "actioned";
  created_at: string;
  reviewed_at: string | null;
}

export interface MemberRow {
  id: string;
  username: string;
  display_name: string;
  avatar_reference: string;
  follower_count: number;
  current_rank: string;
  last_seen_at: string | null;
  role: string;
  isYou: boolean;
}

export interface InvitePreview {
  world: { id: string; name: string; theme: string; size: string; pace: string };
  host: { username: string; display_name: string; avatar_reference: string } | null;
  players: { username: string; display_name: string; avatar_reference: string }[];
  memberCount: number;
  maxMembers: number;
  alreadyMember: boolean;
}
