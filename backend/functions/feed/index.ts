/** Read models that need ranking or cross-table hydration. */
import { adminClient, check, HttpError, requireUser, serve, str, uuid } from "../_shared/http.ts";
import { loadContext } from "../_shared/game/store.ts";
import { discover, type FeedFilter, homeFeed, hydrate, profile, search, sidebar, thread } from "../_shared/game/feed.ts";
import type { PostRow } from "../_shared/game/types.ts";

const FILTERS: FeedFilter[] = ["for_you", "following", "trending", "latest", "communities", "bookmarks"];

serve("feed", async (req, body) => {
  const user = await requireUser(req);
  const db = adminClient();
  const action = String(body.action ?? "");
  const { world, player } = await loadContext(db, user.id, uuid(body.worldId, "World"));

  switch (action) {
    case "home": {
      const filter = FILTERS.includes(body.filter as FeedFilter) ? (body.filter as FeedFilter) : "for_you";
      return await homeFeed(db, world, player, filter, typeof body.cursor === "string" ? body.cursor : null, typeof body.limit === "number" ? body.limit : undefined);
    }
    case "thread":
      return await thread(db, world, player, uuid(body.postId, "Post"), body.sort === "recent" ? "recent" : "relevant");
    case "profile": {
      const tab = body.tab === "replies" ? "replies" : body.tab === "quotes" ? "quotes" : "posts";
      return await profile(db, world, player, str(body.username, "Username", { min: 1, max: 30 }), tab);
    }
    case "search":
      return await search(db, world, player, str(body.q, "Search", { max: 80, optional: true }));
    case "discover":
      return await discover(db, world, player);
    case "sidebar":
      return await sidebar(db, world, player);
    case "relationships": {
      const rels = check(await db.from("relationships").select("id, account_a_id, relationship_score, relationship_status, interaction_count, last_interaction_at").eq("world_id", world.id).eq("account_b_id", player.id).neq("relationship_status", "acquaintance").order("relationship_score", { ascending: false }).limit(60), "rels") as { id: string; account_a_id: string }[];
      const sims = rels.length ? check(await db.from("simulated_accounts").select("id, username, display_name, avatar_reference, archetype, follower_count_cache").in("id", rels.map((r) => r.account_a_id)), "rel_sims") as { id: string }[] : [];
      const events = rels.length ? check(await db.from("relationship_events").select("relationship_id, delta, reason, created_at").in("relationship_id", rels.map((r) => r.id)).order("created_at", { ascending: false }).limit(200), "rel_events") as { relationship_id: string }[] : [];
      return { relationships: rels.map((r) => ({ ...r, account: sims.find((s) => s.id === r.account_a_id) ?? null, history: events.filter((e) => e.relationship_id === r.id).slice(0, 4) })) };
    }
    case "community": {
      const slug = str(body.slug, "Community", { min: 1, max: 60 });
      const c = check(await db.from("communities").select("*").eq("world_id", world.id).eq("slug", slug).maybeSingle(), "community") as { id: string; topic_id: string } | null;
      if (!c) throw new HttpError(404, "Community not found.", "not_found");
      const member = check(await db.from("community_memberships").select("id, standing, role").eq("community_id", c.id).eq("player_id", player.id).maybeSingle(), "community_member");
      const mods = check(await db.from("community_memberships").select("simulated_accounts!inner(id, username, display_name, avatar_reference)").eq("community_id", c.id).eq("role", "moderator").limit(5), "community_mods");
      const events = check(await db.from("world_events").select("id, title, description, started_at").eq("world_id", world.id).eq("source_entity_id", c.id).order("started_at", { ascending: false }).limit(5), "community_events");
      const rows = check(await db.from("posts").select("*").eq("world_id", world.id).eq("topic_id", c.topic_id).is("deleted_at", null).in("post_type", ["post", "quote"]).order("created_at", { ascending: false }).limit(30), "community_posts") as PostRow[];
      return { community: c, membership: member, moderators: mods, events, posts: await hydrate(db, player, rows) };
    }
    default:
      throw new HttpError(400, "Unknown action.", "invalid_action");
  }
});
