/**
 * World lifecycle: list, create + initialize (resumable), sync/catch-up with
 * offline summary, profile and settings updates, delete.
 */
import { adminClient, check, HttpError, requireUser, runInBackground, serve, str, uuid } from "../_shared/http.ts";
import { initializeWorld } from "../_shared/game/init.ts";
import { createPersona, offlineSummary, validatePersona } from "../_shared/game/persona.ts";
import { loadContext, population } from "../_shared/game/store.ts";
import { syncWorld } from "../_shared/game/tick.ts";
import { computeRank } from "../_shared/sim/reputation.ts";
import { ALL_TOPICS } from "../_shared/sim/config.ts";
import type { WorldRow } from "../_shared/game/types.ts";

const THEMES = ["mainstream", "gaming", "tech", "entertainment", "politics", "creator", "underground", "mixed"];

serve("world", async (req, body) => {
  const user = await requireUser(req);
  const db = adminClient();
  const action = String(body.action ?? "");

  if (action === "list") {
    const members = check(await db.from("world_members").select("world_id, role").eq("user_id", user.id).eq("status", "active"), "list_members") as { world_id: string; role: string }[];
    if (!members.length) return { worlds: [] };
    const worlds = check(await db.from("worlds").select("id, name, privacy_mode, world_pace, world_size, world_theme, status, current_tick, created_at, last_simulated_at").in("id", members.map((m) => m.world_id)).order("created_at", { ascending: false }), "list_worlds");
    const players = check(await db.from("player_world_state").select("world_id, username, display_name, avatar_reference, current_rank, follower_count, fame").eq("user_id", user.id), "list_players") as { world_id: string }[];
    return { worlds: (worlds as { id: string }[]).map((w) => ({ ...w, player: players.find((p) => p.world_id === w.id) ?? null })) };
  }

  if (action === "create") {
    const name = str(body.name, "World name", { min: 1, max: 60 });
    const privacy = String(body.privacy ?? "private");
    if (privacy !== "private") throw new HttpError(400, "Shared worlds and private circles are not open yet. Start with a private world.", "not_available");
    const size = String(body.size ?? "small");
    const pace = String(body.pace ?? "standard");
    const theme = String(body.theme ?? "mixed");
    if (!["small", "standard", "large"].includes(size)) throw new HttpError(400, "Invalid world size.", "invalid_input");
    if (!["relaxed", "standard", "fast"].includes(pace)) throw new HttpError(400, "Invalid pace.", "invalid_input");
    if (!THEMES.includes(theme)) throw new HttpError(400, "Invalid atmosphere.", "invalid_input");
    const persona = validatePersona((body.persona ?? {}) as Record<string, unknown>);

    // Resume a stuck initialization instead of creating duplicates.
    const pending = check(await db.from("worlds").select("*").eq("owner_id", user.id).neq("status", "ready").order("created_at", { ascending: false }).limit(1), "pending_world") as WorldRow[];
    const owned = await db.from("worlds").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
    if (!pending.length && (owned.count ?? 0) >= 5) throw new HttpError(400, "You can have up to 5 worlds. Delete one to start another.", "limit");

    let world: WorldRow;
    if (pending.length) {
      world = pending[0];
    } else {
      const seed = Math.floor(Math.random() * 2_000_000_000);
      world = check(await db.from("worlds").insert({ owner_id: user.id, name, privacy_mode: "private", world_size: size, world_pace: pace, world_theme: theme, seed, status: "initializing", init_step: "accounts" }).select("*").single(), "insert_world") as WorldRow;
      check(await db.from("world_members").insert({ world_id: world.id, user_id: user.id, role: "owner" }), "insert_member");
      check(await db.from("world_settings").insert({ world_id: world.id, settings: { theme: "dark" } }), "insert_settings");
    }
    try {
      await initializeWorld(db, world);
      const ready = { ...world, status: "ready" as const };
      check(await db.from("worlds").update({ status: "ready", last_simulated_at: new Date().toISOString() }).eq("id", world.id), "world_ready");
      await createPersona(db, ready, user.id, persona);
      return { worldId: world.id };
    } catch (err) {
      await db.from("worlds").update({ status: "failed" }).eq("id", world.id);
      if (err instanceof HttpError) throw err;
      throw new HttpError(500, "World setup was interrupted. Try again and it will resume where it stopped.", "init_failed");
    }
  }

  const worldId = uuid(body.worldId, "World");

  if (action === "sync") {
    const { world, player } = await loadContext(db, user.id, worldId);
    // Catch-up and due jobs run after responding so the UI stays fast; results show on the next poll.
    runInBackground(syncWorld(db, world));
    const summary = body.includeSummary ? await offlineSummary(db, world, player) : null;
    if (!body.includeSummary) await db.from("player_world_state").update({ last_seen_at: new Date().toISOString() }).eq("id", player.id);
    const unread = await db.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", user.id).eq("world_id", worldId).is("read_at", null);
    const rank = computeRank({ fame: player.fame, influence: player.influence, followers: player.follower_count, outsideReach: player.outside_reach, viralPosts: player.viral_posts, population: population(world) });
    return { world: { ...world, seed: undefined, population: population(world) }, player, rank, unread: unread.count ?? 0, summary };
  }

  if (action === "update_profile") {
    const { player } = await loadContext(db, user.id, worldId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.displayName !== undefined) patch.display_name = str(body.displayName, "Display name", { min: 1, max: 50 });
    if (body.bio !== undefined) patch.bio = str(body.bio, "Bio", { max: 160, optional: true });
    if (body.avatar !== undefined) patch.avatar_reference = str(body.avatar, "Avatar", { min: 1, max: 80 });
    if (body.publicStats !== undefined) patch.public_stats = body.publicStats === true;
    if (body.interests !== undefined) {
      const interests = Array.isArray(body.interests) ? body.interests.filter((i): i is string => typeof i === "string" && ALL_TOPICS.includes(i)).slice(0, 6) : [];
      if (!interests.length) throw new HttpError(400, "Pick at least one interest.", "invalid_input");
      patch.interests = interests;
    }
    if (body.pinnedPostId !== undefined) {
      if (body.pinnedPostId === null) patch.pinned_post_id = null;
      else {
        const pid = uuid(body.pinnedPostId, "Post");
        const own = check(await db.from("posts").select("id").eq("id", pid).eq("author_player_id", player.id).is("deleted_at", null).maybeSingle(), "pin_check");
        if (!own) throw new HttpError(400, "You can only pin your own posts.", "invalid_input");
        patch.pinned_post_id = pid;
      }
    }
    check(await db.from("player_world_state").update(patch).eq("id", player.id), "update_profile");
    return { ok: true };
  }

  if (action === "update_settings") {
    const { world } = await loadContext(db, user.id, worldId);
    if (world.owner_id !== user.id) throw new HttpError(403, "Only the world owner can change settings.", "forbidden");
    const wPatch: Record<string, unknown> = {};
    if (body.name !== undefined) wPatch.name = str(body.name, "World name", { min: 1, max: 60 });
    if (body.pace !== undefined) {
      if (!["relaxed", "standard", "fast"].includes(String(body.pace))) throw new HttpError(400, "Invalid pace.", "invalid_input");
      wPatch.world_pace = body.pace;
    }
    if (Object.keys(wPatch).length) check(await db.from("worlds").update(wPatch).eq("id", world.id), "update_world");
    const sPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.textMode !== undefined) {
      const mode = String(body.textMode);
      if (!["rules", "model"].includes(mode)) throw new HttpError(400, "Invalid text mode.", "invalid_input");
      if (mode === "model" && !Deno.env.get("TEXT_MODEL_ENDPOINT")) throw new HttpError(400, "No language model is configured on the server. The rule-based writer stays active.", "not_available");
      sPatch.text_generation_mode = mode;
    }
    if (body.notificationPreferences !== undefined && typeof body.notificationPreferences === "object") sPatch.notification_preferences = body.notificationPreferences;
    check(await db.from("world_settings").update(sPatch).eq("world_id", world.id), "update_world_settings");
    return { ok: true, modelAvailable: !!Deno.env.get("TEXT_MODEL_ENDPOINT") };
  }

  if (action === "model_status") {
    return { modelAvailable: !!Deno.env.get("TEXT_MODEL_ENDPOINT") };
  }

  if (action === "delete") {
    const world = check(await db.from("worlds").select("id, owner_id").eq("id", worldId).maybeSingle(), "load_world_delete") as { id: string; owner_id: string } | null;
    if (!world || world.owner_id !== user.id) throw new HttpError(403, "Only the owner can delete this world.", "forbidden");
    if (body.confirm !== "DELETE") throw new HttpError(400, "Type DELETE to confirm.", "invalid_input");
    check(await db.from("worlds").delete().eq("id", world.id), "delete_world");
    return { ok: true };
  }

  throw new HttpError(400, "Unknown action.", "invalid_action");
});
