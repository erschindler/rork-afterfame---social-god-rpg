/** Feed ranking, hydration, threads, profiles, search and discovery. */
import { check, type Db, HttpError } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import { LIMITS } from "../sim/config.ts";
import { ARCHETYPE_LABEL, type Archetype } from "../sim/population.ts";
import { computeRank } from "../sim/reputation.ts";
import { type PlayerRow, type PostRow, type WorldRow } from "./types.ts";
import { population } from "./store.ts";

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
  fame: number;
}

export interface PostView {
  id: string;
  post_type: string;
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
  parent: { id: string; username: string } | null;
  quoted: Omit<PostView, "quoted" | "parent" | "viewer"> | null;
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean };
}

const POST_COLS = "id, world_id, author_type, author_player_id, author_simulated_account_id, parent_post_id, root_post_id, quoted_post_id, post_type, content, topic_id, stance, like_count, reply_count, repost_count, quote_count, view_count, spread_stage, is_viral, created_at, deleted_at";

export async function hydrate(db: Db, viewer: PlayerRow, posts: PostRow[]): Promise<PostView[]> {
  const live = posts.filter((p) => !p.deleted_at);
  if (!live.length) return [];
  const quotedIds = [...new Set(live.map((p) => p.quoted_post_id).filter(Boolean))] as string[];
  const parentIds = [...new Set(live.map((p) => p.parent_post_id).filter(Boolean))] as string[];
  const ids = live.map((p) => p.id);
  const empty = Promise.resolve({ data: [], error: null });
  const [quotedRes, parentRes, mineRes] = await Promise.all([
    quotedIds.length ? db.from("posts").select(POST_COLS).in("id", quotedIds) : empty,
    parentIds.length ? db.from("posts").select("id, author_type, author_player_id, author_simulated_account_id").in("id", parentIds) : empty,
    db.from("post_interactions").select("post_id, interaction_type").eq("actor_player_id", viewer.id).in("post_id", ids),
  ]);
  const quoted = check(quotedRes, "hydrate_quoted") as PostRow[];
  const parents = check(parentRes, "hydrate_parents") as PostRow[];
  const mine = check(mineRes, "hydrate_viewer") as { post_id: string; interaction_type: string }[];
  const all = [...live, ...quoted, ...parents];
  const simIds = [...new Set(all.map((p) => p.author_simulated_account_id).filter(Boolean))] as string[];
  const playerIds = [...new Set(all.map((p) => p.author_player_id).filter(Boolean))] as string[];
  const [simRes, playerRes] = await Promise.all([
    simIds.length ? db.from("simulated_accounts").select("id, username, display_name, avatar_reference, bio, archetype, follower_count_cache, fame").in("id", simIds) : empty,
    playerIds.length ? db.from("player_world_state").select("id, username, display_name, avatar_reference, bio, current_rank, follower_count, fame").in("id", playerIds) : empty,
  ]);
  const sims = check(simRes, "hydrate_sims") as { id: string; username: string; display_name: string; avatar_reference: string; bio: string; archetype: string; follower_count_cache: number; fame: number }[];
  const players = check(playerRes, "hydrate_players") as { id: string; username: string; display_name: string; avatar_reference: string; bio: string; current_rank: string; follower_count: number; fame: number }[];
  const authors = new Map<string, AuthorView>();
  for (const s of sims) authors.set(s.id, { kind: "sim", id: s.id, username: s.username, display_name: s.display_name, avatar: s.avatar_reference, bio: s.bio, is_simulated: true, is_self: false, label: ARCHETYPE_LABEL[s.archetype as Archetype] ?? s.archetype, followers: s.follower_count_cache, fame: s.fame });
  for (const p of players) authors.set(p.id, { kind: "player", id: p.id, username: p.username, display_name: p.display_name, avatar: p.avatar_reference, bio: p.bio, is_simulated: false, is_self: p.id === viewer.id, label: p.current_rank, followers: p.follower_count, fame: p.fame });
  const has = (id: string, t: string) => mine.some((m) => m.post_id === id && m.interaction_type === t);
  const authorOf = (p: PostRow) => authors.get((p.author_simulated_account_id ?? p.author_player_id)!);
  const base = (p: PostRow) => ({
    id: p.id, post_type: p.post_type, content: p.content, topic_id: p.topic_id, created_at: p.created_at, like_count: p.like_count, reply_count: p.reply_count,
    repost_count: p.repost_count, quote_count: p.quote_count, view_count: p.view_count, is_viral: p.is_viral, spread_stage: p.spread_stage, stance: p.stance, author: authorOf(p)!,
  });
  return live.filter((p) => authorOf(p)).map((p) => {
    const q = p.quoted_post_id ? quoted.find((x) => x.id === p.quoted_post_id && !x.deleted_at) : null;
    const par = p.parent_post_id ? parents.find((x) => x.id === p.parent_post_id) : null;
    return {
      ...base(p),
      parent: par ? { id: par.id, username: authorOf(par)?.username ?? "unknown" } : null,
      quoted: q && authorOf(q) ? base(q) : null,
      viewer: { liked: has(p.id, "like"), reposted: has(p.id, "repost"), bookmarked: has(p.id, "bookmark") },
    };
  });
}

export type FeedFilter = "for_you" | "following" | "trending" | "latest" | "communities" | "bookmarks";

export interface FeedItem {
  kind: "post" | "event";
  post?: PostView;
  event?: Record<string, unknown>;
}

async function mutedIds(db: Db, player: PlayerRow): Promise<string[]> {
  const rows = check(await db.from("player_filters").select("target_simulated_account_id").eq("player_id", player.id), "muted") as { target_simulated_account_id: string }[];
  return rows.map((r) => r.target_simulated_account_id);
}

export async function homeFeed(db: Db, world: WorldRow, player: PlayerRow, filter: FeedFilter, cursor: string | null, limitIn?: number): Promise<{ items: FeedItem[]; nextCursor: string | null }> {
  const limit = clamp(limitIn ?? LIMITS.feedPageSize, 5, LIMITS.maxFeedPageSize);
  const muted = await mutedIds(db, player);
  let q = db.from("posts").select(POST_COLS).eq("world_id", world.id).is("deleted_at", null);
  if (muted.length) q = q.not("author_simulated_account_id", "in", `(${muted.join(",")})`);

  if (filter === "bookmarks") {
    const offset = Number(cursor ?? 0) || 0;
    const marks = check(await db.from("post_interactions").select("post_id").eq("actor_player_id", player.id).eq("interaction_type", "bookmark").order("created_at", { ascending: false }).range(offset, offset + limit - 1), "bookmarks") as { post_id: string }[];
    if (!marks.length) return { items: [], nextCursor: null };
    const posts = check(await db.from("posts").select(POST_COLS).in("id", marks.map((m) => m.post_id)), "bookmark_posts") as PostRow[];
    const ordered = marks.map((m) => posts.find((p) => p.id === m.post_id)).filter(Boolean) as PostRow[];
    return { items: (await hydrate(db, player, ordered)).map((p) => ({ kind: "post", post: p })), nextCursor: marks.length === limit ? String(offset + limit) : null };
  }

  if (filter === "trending") {
    const offset = Number(cursor ?? 0) || 0;
    const trends = check(await db.from("trends").select("id").eq("world_id", world.id).in("status", ["emerging", "rising", "peak"]), "trend_ids") as { id: string }[];
    const links = trends.length ? check(await db.from("trend_posts").select("post_id").in("trend_id", trends.map((t) => t.id)).order("created_at", { ascending: false }).limit(200), "trend_links") as { post_id: string }[] : [];
    const viralQ = check(await db.from("posts").select("id").eq("world_id", world.id).eq("is_viral", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(20), "viral_ids") as { id: string }[];
    const ids = [...new Set([...viralQ.map((v) => v.id), ...links.map((l) => l.post_id)])];
    if (!ids.length) return { items: [], nextCursor: null };
    const posts = (check(await q.in("id", ids.slice(0, 200)), "trending_posts") as PostRow[]).sort((a, b) => (b.like_count + b.repost_count * 3 + b.quote_count * 3) - (a.like_count + a.repost_count * 3 + a.quote_count * 3));
    const page = posts.slice(offset, offset + limit);
    return { items: (await hydrate(db, player, page)).map((p) => ({ kind: "post", post: p })), nextCursor: offset + limit < posts.length ? String(offset + limit) : null };
  }

  q = q.in("post_type", ["post", "quote"]);
  if (cursor) q = q.lt("created_at", cursor);
  if (filter === "following") {
    const f = check(await db.from("follows").select("followed_simulated_account_id").eq("follower_player_id", player.id), "following_ids") as { followed_simulated_account_id: string }[];
    const ids = f.map((x) => x.followed_simulated_account_id).filter(Boolean);
    q = ids.length ? q.or(`author_player_id.eq.${player.id},author_simulated_account_id.in.(${ids.join(",")})`) : q.eq("author_player_id", player.id);
  } else if (filter === "communities") {
    const mine = check(await db.from("community_memberships").select("communities!inner(topic_id)").eq("player_id", player.id), "my_communities") as unknown as { communities: { topic_id: string } }[];
    let topics = mine.map((m) => m.communities.topic_id);
    if (!topics.length) topics = (check(await db.from("communities").select("topic_id").eq("world_id", world.id), "all_comm_topics") as { topic_id: string }[]).map((c) => c.topic_id);
    q = q.in("topic_id", topics);
  }

  const windowSize = filter === "for_you" ? limit + 15 : limit;
  const rows = check(await q.order("created_at", { ascending: false }).limit(windowSize), "feed_posts") as PostRow[];
  const nextCursor = rows.length === windowSize ? rows[rows.length - 1].created_at : null;
  let ordered = rows;
  if (filter === "for_you") ordered = await rankForYou(db, world, player, rows);
  const hydrated = await hydrate(db, player, ordered);
  const items: FeedItem[] = hydrated.map((p) => ({ kind: "post", post: p }));

  if (filter === "for_you" && !cursor) {
    const events = check(await db.from("world_events").select("id, event_type, category, title, description, severity, status, involves_player, started_at").eq("world_id", world.id).gte("severity", 2).order("started_at", { ascending: false }).limit(2), "feed_events") as Record<string, unknown>[];
    events.forEach((e, i) => items.splice(Math.min(items.length, 4 + i * 7), 0, { kind: "event", event: e }));
  }
  return { items, nextCursor };
}

/** Controlled, explainable For You ranking within a time window. */
async function rankForYou(db: Db, world: WorldRow, player: PlayerRow, rows: PostRow[]): Promise<PostRow[]> {
  const authorIds = [...new Set(rows.map((r) => r.author_simulated_account_id).filter(Boolean))] as string[];
  const [followRes, relRes] = await Promise.all([
    db.from("follows").select("followed_simulated_account_id").eq("follower_player_id", player.id),
    authorIds.length ? db.from("relationships").select("account_a_id, relationship_score").eq("account_b_id", player.id).in("account_a_id", authorIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const follows = new Set((check(followRes, "fy_follows") as { followed_simulated_account_id: string }[]).map((f) => f.followed_simulated_account_id));
  const rels = check(relRes, "fy_rels") as { account_a_id: string; relationship_score: number }[];
  const relMap = new Map(rels.map((r) => [r.account_a_id, r.relationship_score]));
  const rng = new Rng(`${player.id}:${world.current_tick}`);
  const scored = rows.map((p) => {
    const ageH = (Date.now() - Date.parse(p.created_at)) / 3_600_000;
    const authorId = p.author_simulated_account_id ?? "";
    const score = (p.topic_id && player.interests.includes(p.topic_id) ? 0.3 : 0) + (follows.has(authorId) ? 0.35 : 0) + Math.abs(relMap.get(authorId) ?? 0) / 100 * 0.25 +
      Math.log10(p.like_count + p.repost_count * 2 + 1) / 4 * 0.25 + Math.exp(-ageH / 10) * 0.3 + (p.is_viral ? 0.1 : 0) + (p.author_player_id === player.id ? 0.2 : 0) + rng.range(0, 0.12);
    return { p, score, authorId: p.author_simulated_account_id ?? p.author_player_id ?? "" };
  }).sort((a, b) => b.score - a.score);
  // Diversity: penalize repeated authors so a few loud accounts cannot dominate.
  const seen = new Map<string, number>();
  return scored.map((s) => {
    const n = seen.get(s.authorId) ?? 0;
    seen.set(s.authorId, n + 1);
    return { ...s, score: s.score - n * 0.25 };
  }).sort((a, b) => b.score - a.score).map((s) => s.p);
}

export async function thread(db: Db, world: WorldRow, player: PlayerRow, postId: string, sort: "relevant" | "recent") {
  const post = check(await db.from("posts").select(POST_COLS).eq("world_id", world.id).eq("id", postId).maybeSingle(), "thread_post") as PostRow | null;
  if (!post || post.deleted_at) throw new HttpError(404, "This post is unavailable. It may have been deleted.", "not_found");
  const ancestors: PostRow[] = [];
  let cur = post;
  for (let i = 0; i < 3 && cur.parent_post_id; i++) {
    const parent = check(await db.from("posts").select(POST_COLS).eq("id", cur.parent_post_id).maybeSingle(), "thread_parent") as PostRow | null;
    if (!parent) break;
    ancestors.unshift(parent);
    cur = parent;
  }
  let rq = db.from("posts").select(POST_COLS).eq("parent_post_id", post.id).is("deleted_at", null);
  rq = sort === "recent" ? rq.order("created_at", { ascending: false }) : rq.order("like_count", { ascending: false }).order("created_at", { ascending: true });
  const replies = check(await rq.limit(60), "thread_replies") as PostRow[];
  const quotes = check(await db.from("posts").select(POST_COLS).eq("quoted_post_id", post.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(10), "thread_quotes") as PostRow[];
  const spread = check(await db.from("post_spread").select("stage, label, detail, count, created_at").eq("post_id", post.id).order("created_at"), "thread_spread") as { stage: string; label: string; detail: string; count: number; created_at: string }[];
  const [main] = await hydrate(db, player, [post]);
  const anc = await hydrate(db, player, ancestors.filter((a) => !a.deleted_at));
  let comparison: string | null = null;
  if (post.author_player_id === player.id) {
    const recent = check(await db.from("posts").select("like_count, view_count").eq("author_player_id", player.id).neq("id", post.id).eq("post_type", "post").order("created_at", { ascending: false }).limit(10), "recent_avg") as { like_count: number; view_count: number }[];
    if (recent.length >= 2) {
      const avg = recent.reduce((a, r) => a + r.view_count, 0) / recent.length;
      if (avg > 0) {
        const ratio = post.view_count / avg;
        comparison = ratio >= 1.15 ? `This post performed ${ratio.toFixed(1)}× better than your recent average.` : ratio <= 0.85 ? `This post reached ${Math.round((1 - ratio) * 100)}% fewer people than your recent average.` : "This post performed about the same as your recent average.";
      }
    }
  }
  return {
    post: main,
    ancestors: anc,
    replies: await hydrate(db, player, replies),
    quotes: await hydrate(db, player, quotes),
    spread,
    comparison,
    ancestorsMissing: post.parent_post_id !== null && ancestors.length === 0,
  };
}

export async function profile(db: Db, world: WorldRow, viewer: PlayerRow, username: string, tab: "posts" | "replies" | "quotes") {
  const handle = username.replace(/^@/, "").toLowerCase();
  const sim = check(await db.from("simulated_accounts").select("*").eq("world_id", world.id).eq("username", handle).maybeSingle(), "profile_sim") as Record<string, unknown> | null;
  const typeFilter = tab === "replies" ? ["reply"] : tab === "quotes" ? ["quote"] : ["post", "quote"];
  if (sim) {
    const posts = check(await db.from("posts").select(POST_COLS).eq("author_simulated_account_id", sim.id).is("deleted_at", null).in("post_type", typeFilter).order("created_at", { ascending: false }).limit(30), "profile_sim_posts") as PostRow[];
    const rel = check(await db.from("relationships").select("id, relationship_score, relationship_status, interaction_count, last_interaction_at").eq("account_a_id", sim.id).eq("account_b_id", viewer.id).maybeSingle(), "profile_rel") as { id: string } & Record<string, unknown> | null;
    const relEvents = rel ? check(await db.from("relationship_events").select("delta, new_score, reason, created_at").eq("relationship_id", rel.id).order("created_at", { ascending: false }).limit(8), "profile_rel_events") : [];
    const memories = check(await db.from("account_memories").select("memory_type, summary, sentiment, occurred_at").eq("simulated_account_id", sim.id).eq("related_entity_id", viewer.id).order("occurred_at", { ascending: false }).limit(5), "profile_memories");
    const following = check(await db.from("follows").select("id").eq("follower_player_id", viewer.id).eq("followed_simulated_account_id", sim.id).maybeSingle(), "profile_following");
    const followsYou = check(await db.from("follows").select("id").eq("follower_simulated_account_id", sim.id).eq("followed_player_id", viewer.id).maybeSingle(), "profile_follows_you");
    const filters = check(await db.from("player_filters").select("kind").eq("player_id", viewer.id).eq("target_simulated_account_id", sim.id), "profile_filters") as { kind: string }[];
    const communities = check(await db.from("community_memberships").select("role, communities!inner(id, name, slug)").eq("simulated_account_id", sim.id), "profile_comms");
    const events = check(await db.from("world_events").select("id, title, description, started_at, event_type").eq("world_id", world.id).contains("related_account_ids", [sim.id]).order("started_at", { ascending: false }).limit(5), "profile_events");
    return {
      kind: "sim",
      account: {
        id: sim.id, username: sim.username, display_name: sim.display_name, bio: sim.bio, avatar: sim.avatar_reference, archetype: sim.archetype,
        label: ARCHETYPE_LABEL[sim.archetype as Archetype], interests: sim.interests, followers: sim.follower_count_cache, following: sim.following_count_cache,
        fame: sim.fame, credibility: sim.credibility, admiration: sim.admiration, infamy: sim.infamy, influence: sim.influence, controversy: sim.controversy,
        joined: sim.account_created_at, goals: sim.current_goals, communication_style: sim.communication_style,
      },
      relationship: rel, relationshipHistory: relEvents, memories, communities, events,
      viewer: { following: !!following, followsYou: !!followsYou, muted: filters.some((f) => f.kind === "mute"), blocked: filters.some((f) => f.kind === "block") },
      posts: await hydrate(db, viewer, posts),
    };
  }
  const pl = check(await db.from("player_world_state").select("*").eq("world_id", world.id).eq("username", handle).maybeSingle(), "profile_player") as PlayerRow & { public_stats: boolean; pinned_post_id: string | null } | null;
  if (!pl) throw new HttpError(404, "No account with that username exists in this world.", "not_found");
  const isSelf = pl.id === viewer.id;
  const posts = check(await db.from("posts").select(POST_COLS).eq("author_player_id", pl.id).is("deleted_at", null).in("post_type", typeFilter).order("created_at", { ascending: false }).limit(30), "profile_player_posts") as PostRow[];
  const pinned = pl.pinned_post_id ? check(await db.from("posts").select(POST_COLS).eq("id", pl.pinned_post_id).maybeSingle(), "pinned") as PostRow | null : null;
  const achievements = check(await db.from("player_achievements").select("unlocked_at, is_public, achievements!inner(code, name, description)").eq("player_id", pl.id).order("unlocked_at", { ascending: false }), "profile_achievements");
  const milestones = check(await db.from("world_events").select("id, title, description, started_at, event_type").eq("world_id", world.id).eq("involves_player", true).eq("source_entity_id", pl.id).order("started_at", { ascending: false }).limit(5), "profile_milestones");
  const showStats = isSelf || pl.public_stats;
  const rank = computeRank({ fame: pl.fame, influence: pl.influence, followers: pl.follower_count, outsideReach: pl.outside_reach, viralPosts: pl.viral_posts, population: population(world) });
  return {
    kind: "player",
    account: {
      id: pl.id, username: pl.username, display_name: pl.display_name, bio: pl.bio, avatar: pl.avatar_reference, interests: pl.interests, followers: pl.follower_count,
      following: pl.following_count, posts: pl.post_count, joined: pl.created_at, rank: pl.current_rank, notoriety: pl.notoriety_rank, career: pl.career_identity,
      niche_topic: pl.niche_topic, public_stats: pl.public_stats, streak_days: pl.streak_days,
      stats: showStats ? { fame: pl.fame, admiration: pl.admiration, infamy: pl.infamy, credibility: pl.credibility, influence: pl.influence, controversy: pl.controversy, audience_loyalty: pl.audience_loyalty, niche_authority: pl.niche_authority } : null,
      rankProgress: showStats ? rank : null,
    },
    isSelf,
    pinned: pinned && !pinned.deleted_at ? (await hydrate(db, viewer, [pinned]))[0] ?? null : null,
    achievements, milestones,
    posts: await hydrate(db, viewer, posts),
  };
}

export async function search(db: Db, world: WorldRow, viewer: PlayerRow, raw: string) {
  const q = raw.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  if (q.length < 2) return { accounts: [], posts: [], trends: [], communities: [] };
  const like = `%${q.replace(/^[@#]/, "")}%`;
  const accounts = check(await db.from("simulated_accounts").select("id, username, display_name, avatar_reference, bio, archetype, follower_count_cache").eq("world_id", world.id).or(`username.ilike.${like},display_name.ilike.${like}`).order("fame", { ascending: false }).limit(10), "search_accounts") as Record<string, unknown>[];
  const players = check(await db.from("player_world_state").select("id, username, display_name, avatar_reference, bio, follower_count, current_rank").eq("world_id", world.id).or(`username.ilike.${like},display_name.ilike.${like}`).limit(5), "search_players") as Record<string, unknown>[];
  const posts = check(await db.from("posts").select(POST_COLS).eq("world_id", world.id).is("deleted_at", null).textSearch("content", q, { type: "websearch", config: "english" }).order("created_at", { ascending: false }).limit(20), "search_posts") as PostRow[];
  const trends = check(await db.from("trends").select("id, name, slug, status, activity_score, post_count").eq("world_id", world.id).ilike("name", like).limit(8), "search_trends");
  const communities = check(await db.from("communities").select("id, name, slug, description, member_count").eq("world_id", world.id).or(`name.ilike.${like},description.ilike.${like}`).limit(8), "search_communities");
  return {
    accounts: [
      ...players.map((p) => ({ kind: "player", id: p.id, username: p.username, display_name: p.display_name, avatar: p.avatar_reference, bio: p.bio, followers: p.follower_count, label: p.current_rank, is_simulated: false })),
      ...accounts.map((a) => ({ kind: "sim", id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar_reference, bio: a.bio, followers: a.follower_count_cache, label: ARCHETYPE_LABEL[a.archetype as Archetype], is_simulated: true })),
    ],
    posts: await hydrate(db, viewer, posts),
    trends,
    communities,
  };
}

export async function discover(db: Db, world: WorldRow, viewer: PlayerRow) {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const simCols = "id, username, display_name, avatar_reference, bio, archetype, follower_count_cache, fame, updated_at";
  const mapSim = (a: Record<string, unknown>) => ({ kind: "sim", id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar_reference, bio: a.bio, followers: a.follower_count_cache, label: ARCHETYPE_LABEL[a.archetype as Archetype], is_simulated: true, fame: a.fame });
  const [breakRes, fillRes, newRes, discRes, divRes, trendRes, commRes, evRes] = await Promise.all([
    db.from("world_events").select("related_account_ids").eq("world_id", world.id).eq("event_type", "breakout_creator").order("started_at", { ascending: false }).limit(6),
    db.from("simulated_accounts").select(simCols).eq("world_id", world.id).gte("fame", 15).lte("fame", 45).order("updated_at", { ascending: false }).limit(8),
    db.from("simulated_accounts").select(simCols).eq("world_id", world.id).in("archetype", ["small_creator", "artist", "memer"]).order("account_created_at", { ascending: false }).limit(6),
    db.from("posts").select(POST_COLS).eq("world_id", world.id).is("deleted_at", null).in("post_type", ["post", "quote"]).gte("created_at", since).order("reply_count", { ascending: false }).limit(6),
    db.from("posts").select(POST_COLS).eq("world_id", world.id).is("deleted_at", null).in("stance", ["hot_take", "feud_jab"]).gte("created_at", since).order("quote_count", { ascending: false }).order("reply_count", { ascending: false }).limit(6),
    db.from("trends").select("id, name, slug, status, activity_score, post_count, participant_count, topic_id, origin_type").eq("world_id", world.id).neq("status", "ended").order("activity_score", { ascending: false }).limit(10),
    db.from("communities").select("id, name, slug, description, member_count, activity_score, topic_id, community_norms").eq("world_id", world.id).order("activity_score", { ascending: false }).limit(12),
    db.from("world_events").select("id, event_type, category, title, description, severity, status, started_at").eq("world_id", world.id).gte("severity", 3).order("started_at", { ascending: false }).limit(5),
  ]);
  const breakoutIds = (check(breakRes, "disc_breakouts") as { related_account_ids: string[] }[]).flatMap((e) => e.related_account_ids);
  const rising = breakoutIds.length ? check(await db.from("simulated_accounts").select(simCols).in("id", breakoutIds), "disc_rising") as Record<string, unknown>[] : [];
  const risingFill = check(fillRes, "disc_rising_fill") as Record<string, unknown>[];
  const newCreators = check(newRes, "disc_new") as Record<string, unknown>[];
  const [mostDiscussed, mostDivisive] = await Promise.all([hydrate(db, viewer, check(discRes, "disc_discussed") as PostRow[]), hydrate(db, viewer, check(divRes, "disc_divisive") as PostRow[])]);
  const seenIds = new Set<string>();
  const uniq = (arr: Record<string, unknown>[]) => arr.filter((a) => (seenIds.has(String(a.id)) ? false : (seenIds.add(String(a.id)), true)));
  return {
    rising: uniq([...rising, ...risingFill]).slice(0, 8).map(mapSim),
    newCreators: uniq(newCreators).map(mapSim),
    mostDiscussed,
    mostDivisive,
    trends: check(trendRes, "disc_trends"),
    communities: check(commRes, "disc_communities"),
    events: check(evRes, "disc_events"),
  };
}

export async function sidebar(db: Db, world: WorldRow, player: PlayerRow) {
  const [trendRes, followRes, chRes, evRes, debRes, myCommRes] = await Promise.all([
    db.from("trends").select("id, name, slug, status, post_count, activity_score, topic_id").eq("world_id", world.id).neq("status", "ended").order("activity_score", { ascending: false }).limit(5),
    db.from("follows").select("followed_simulated_account_id").eq("follower_player_id", player.id),
    db.from("daily_challenges").select("id, code, title, description, target, progress, completed_at").eq("player_id", player.id).eq("challenge_date", new Date().toISOString().slice(0, 10)),
    db.from("world_events").select("id, title, description, severity, status, started_at, event_type").eq("world_id", world.id).order("started_at", { ascending: false }).limit(3),
    db.from("posts").select("id, content, reply_count, quote_count, topic_id").eq("world_id", world.id).is("deleted_at", null).eq("stance", "hot_take").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).order("reply_count", { ascending: false }).limit(3),
    db.from("community_memberships").select("community_id").eq("player_id", player.id),
  ]);
  const following = (check(followRes, "side_following") as { followed_simulated_account_id: string }[]).map((f) => f.followed_simulated_account_id).filter(Boolean);
  const myComms = check(myCommRes, "side_my_comms") as { community_id: string }[];
  let sq = db.from("simulated_accounts").select("id, username, display_name, avatar_reference, bio, archetype, follower_count_cache, fame, interests").eq("world_id", world.id).overlaps("interests", player.interests.length ? player.interests : ["everyday"]).gte("fame", 8).order("fame", { ascending: false }).limit(25);
  if (following.length) sq = sq.not("id", "in", `(${following.join(",")})`);
  let cq = db.from("communities").select("id, name, slug, member_count, topic_id").eq("world_id", world.id).order("activity_score", { ascending: false }).limit(3);
  if (myComms.length) cq = cq.not("id", "in", `(${myComms.map((c) => c.community_id).join(",")})`);
  const [candRes, commRes] = await Promise.all([sq, cq]);
  const candidates = check(candRes, "side_suggest") as Record<string, unknown>[];
  const rng = new Rng(`${player.id}:${new Date().toISOString().slice(0, 13)}`);
  const suggestions = rng.sample(candidates, 3).map((a) => ({ kind: "sim", id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar_reference, bio: a.bio, followers: a.follower_count_cache, label: ARCHETYPE_LABEL[a.archetype as Archetype], is_simulated: true }));
  const rank = computeRank({ fame: player.fame, influence: player.influence, followers: player.follower_count, outsideReach: player.outside_reach, viralPosts: player.viral_posts, population: population(world) });
  return { trends: check(trendRes, "side_trends"), suggestions, challenges: check(chRes, "side_challenges"), events: check(evRes, "side_events"), debates: check(debRes, "side_debates"), communities: check(commRes, "side_communities"), rank };
}
