/** Player social actions. All authoritative changes are computed here. */
import { adminClient, check, HttpError, requireUser, runInBackground, serve, str, uuid } from "../_shared/http.ts";
import { loadContext } from "../_shared/game/store.ts";
import { createPlayerPost, createThread, respondToCollab, respondToEvent, setCommunity, setFilter, setFollow, setInteraction, validatePoll, votePoll } from "../_shared/game/actions.ts";
import { respondDmOffer, sendDm } from "../_shared/game/dm.ts";
import { listReports } from "../_shared/game/moderation.ts";
import { scheduleJob } from "../_shared/game/distribute.ts";
import { LIMITS } from "../_shared/sim/config.ts";
import { processDueJobs } from "../_shared/game/tick.ts";


serve("social", async (req, body) => {
  const user = await requireUser(req);
  const db = adminClient();
  const action = String(body.action ?? "");
  const worldId = uuid(body.worldId, "World");
  const { world, player } = await loadContext(db, user.id, worldId);

  // Generic per-minute action limit protects the backend without blocking normal play.
  if (["like", "unlike", "repost", "unrepost", "bookmark", "unbookmark", "follow", "unfollow"].includes(action)) {
    const since = new Date(Date.now() - 60_000).toISOString();
    const recent = await db.from("post_interactions").select("id", { count: "exact", head: true }).eq("actor_player_id", player.id).gte("created_at", since);
    if ((recent.count ?? 0) >= LIMITS.actionsPerMinute) throw new HttpError(429, "Slow down a little — too many actions in a minute.", "rate_limited");
  }

  switch (action) {
    case "post":
    case "reply":
    case "quote": {
      const content = str(body.content, "Post", { min: 1, max: LIMITS.maxPostLength });
      const topic = typeof body.topic === "string" && body.topic ? body.topic : null;
      const result = await createPlayerPost(db, world, player, {
        kind: action, content, topic,
        parentId: action === "reply" ? uuid(body.parentId, "Reply target") : null,
        quotedId: action === "quote" ? uuid(body.quotedId, "Quoted post") : null,
        poll: action === "post" ? validatePoll(body.poll) : null,
      });
      runInBackground(processDueJobs(db, world));
      return { postId: result.post.id };
    }
    case "thread": {
      const contents = Array.isArray(body.contents) ? body.contents.filter((c): c is string => typeof c === "string") : [];
      const topic = typeof body.topic === "string" && body.topic ? body.topic : null;
      const result = await createThread(db, world, player, contents, topic);
      runInBackground(processDueJobs(db, world));
      return { postId: result.postIds[0], postIds: result.postIds };
    }
    case "vote":
      return await votePoll(db, world, player, uuid(body.postId, "Post"), Number(body.option));
    case "dm_send": {
      const res = await sendDm(db, world, player, uuid(body.accountId, "Account"), String(body.content ?? ""));
      return res;
    }
    case "dm_offer":
      return await respondDmOffer(db, world, player, uuid(body.messageId, "Message"), body.accept === true);
    case "reports":
      return await listReports(db, world, user.id);
    case "delete_post": {
      const postId = uuid(body.postId, "Post");
      const res = check(await db.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId).eq("author_player_id", player.id).is("deleted_at", null).select("id"), "delete_post") as unknown[];
      if (!res.length) throw new HttpError(404, "Post not found.", "not_found");
      await db.rpc("refresh_player_counts", { pid: player.id });
      return { ok: true };
    }
    case "like":
    case "unlike":
      return await setInteraction(db, world, player, uuid(body.postId, "Post"), "like", action === "like");
    case "repost":
    case "unrepost":
      return await setInteraction(db, world, player, uuid(body.postId, "Post"), "repost", action === "repost");
    case "bookmark":
    case "unbookmark":
      return await setInteraction(db, world, player, uuid(body.postId, "Post"), "bookmark", action === "bookmark");
    case "follow":
    case "unfollow":
      return await setFollow(db, world, player, uuid(body.accountId, "Account"), action === "follow");
    case "mute":
    case "unmute":
      await setFilter(db, world, player, uuid(body.accountId, "Account"), "mute", action === "mute");
      return { ok: true };
    case "block":
    case "unblock":
      await setFilter(db, world, player, uuid(body.accountId, "Account"), "block", action === "block");
      return { ok: true };
    case "join_community":
    case "leave_community":
      await setCommunity(db, world, player, uuid(body.communityId, "Community"), action === "join_community");
      return { ok: true };
    case "respond_event": {
      const choice = String(body.choice ?? "");
      if (!["apologize", "stand_firm", "ignore", "clarify"].includes(choice)) throw new HttpError(400, "Invalid response.", "invalid_input");
      return await respondToEvent(db, world, player, uuid(body.eventId, "Event"), choice as "apologize");
    }
    case "respond_collab":
      return await respondToCollab(db, world, player, uuid(body.notificationId, "Invitation"), body.accept === true);
    case "read_notifications": {
      const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string").slice(0, 200) : null;
      let q = db.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_user_id", user.id).eq("world_id", world.id).is("read_at", null);
      if (ids) q = q.in("id", ids);
      check(await q, "read_notifications");
      return { ok: true };
    }
    case "report": {
      const targetType = String(body.targetType ?? "");
      if (!["post", "sim", "player"].includes(targetType)) throw new HttpError(400, "Invalid report target.", "invalid_input");
      const since = new Date(Date.now() - 3600_000).toISOString();
      const recent = await db.from("moderation_reports").select("id", { count: "exact", head: true }).eq("reporter_user_id", user.id).gte("created_at", since);
      if ((recent.count ?? 0) >= 20) throw new HttpError(429, "You've sent a lot of reports. Try again later.", "rate_limited");
      const row = check(await db.from("moderation_reports").insert({ world_id: world.id, reporter_user_id: user.id, target_entity_type: targetType, target_entity_id: uuid(body.targetId, "Target"), reason: str(body.reason, "Reason", { min: 3, max: 500 }) }).select("id").single(), "insert_report") as { id: string };
      // Moderators take a minute or few to look — like a real queue.
      const delay = 60_000 + Math.floor(Math.random() * 180_000);
      await scheduleJob(db, world.id, "review_report", { report_id: row.id }, new Date(Date.now() + delay), `report:${row.id}`);
      return { ok: true, reportId: row.id };
    }
    default:
      throw new HttpError(400, "Unknown action.", "invalid_action");
  }
});
