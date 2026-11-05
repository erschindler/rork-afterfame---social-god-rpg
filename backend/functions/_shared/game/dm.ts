/**
 * Direct messages between a player and SIM accounts. Players write; SIMs read
 * (Seen), type (typing indicator) and answer in a human rhythm. A background
 * task does the live reply; a `dm_reply` job is the retry-safe fallback.
 */
import { check, type Db, HttpError, runInBackground } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import { classifyDm, dmOpener, type DmOpenerKind, dmReply, typingMs } from "../sim/dm.ts";
import { extractHook } from "../sim/text.ts";
import { SIM_COLUMNS, type PlayerRow, type SimRow, type WorldRow } from "./types.ts";
import { applyReputation, notify, remember, updateRelationship } from "./store.ts";
import { scheduleJob } from "./distribute.ts";
import { voiceOf } from "./util.ts";
import { ensureLedger, flushLedgers, ledgerFor } from "./usage.ts";

export interface DmThreadRow {
  id: string;
  world_id: string;
  player_id: string;
  sim_id: string;
  status: "open" | "request";
  last_message_at: string;
  last_preview: string | null;
  last_sender: "player" | "sim" | null;
  unread_count: number;
  sim_typing_until: string | null;
  player_last_read_at: string | null;
  sim_last_read_at: string | null;
  created_at: string;
}

export interface DmMessageRow {
  id: string;
  thread_id: string;
  sender_type: "player" | "sim";
  content: string;
  kind: "text" | "offer" | "system";
  meta: Record<string, unknown>;
  created_at: string;
}

const AUTHOR_COLS = "id, username, display_name, avatar_reference, archetype, fame, follower_count_cache, account_status";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadSim(db: Db, worldId: string, simId: string): Promise<SimRow | null> {
  return check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", worldId).eq("id", simId).maybeSingle(), "dm_sim") as SimRow | null;
}

async function relScore(db: Db, worldId: string, simId: string, playerId: string): Promise<number> {
  const r = check(await db.from("relationships").select("relationship_score").eq("world_id", worldId).eq("account_a_id", simId).eq("account_b_id", playerId).maybeSingle(), "dm_rel") as { relationship_score: number } | null;
  return r?.relationship_score ?? 0;
}

async function findOrCreateThread(db: Db, world: WorldRow, playerId: string, simId: string, status: "open" | "request" = "open"): Promise<DmThreadRow> {
  const existing = check(await db.from("dm_threads").select("*").eq("player_id", playerId).eq("sim_id", simId).maybeSingle(), "dm_find") as DmThreadRow | null;
  if (existing) return existing;
  const ins = await db.from("dm_threads").insert({ world_id: world.id, player_id: playerId, sim_id: simId, status }).select("*").single();
  if (ins.error?.code === "23505") return check(await db.from("dm_threads").select("*").eq("player_id", playerId).eq("sim_id", simId).single(), "dm_refind") as DmThreadRow;
  return check(ins, "dm_create") as DmThreadRow;
}

/** Player sends a DM. Returns immediately; the SIM's reply streams in. */
export async function sendDm(db: Db, world: WorldRow, player: PlayerRow, simId: string, raw: string, opts: { localAi?: boolean } = {}): Promise<{ threadId: string; message: DmMessageRow }> {
  const content = raw.trim();
  if (content.length < 1 || content.length > 500) throw new HttpError(400, "Messages are 1 to 500 characters.", "invalid_input");
  const sim = await loadSim(db, world.id, simId);
  if (!sim || sim.account_status !== "active") throw new HttpError(404, "Account not found.", "not_found");
  const blocked = check(await db.from("player_filters").select("id").eq("player_id", player.id).eq("target_simulated_account_id", sim.id).eq("kind", "block").maybeSingle(), "dm_block");
  if (blocked) throw new HttpError(400, "Unblock this account to message them.", "invalid_action");
  const thread = await findOrCreateThread(db, world, player.id, sim.id);
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const recentThreads = check(await db.from("dm_threads").select("id").eq("player_id", player.id), "dm_threads_own") as { id: string }[];
  const recent = await db.from("dm_messages").select("id", { count: "exact", head: true }).in("thread_id", recentThreads.map((t) => t.id)).eq("sender_type", "player").gte("created_at", since);
  if ((recent.count ?? 0) >= 30) throw new HttpError(429, "You're messaging very fast. Take a breath.", "rate_limited");

  const message = check(await db.from("dm_messages").insert({ world_id: world.id, thread_id: thread.id, sender_type: "player", content }).select("*").single(), "dm_insert") as DmMessageRow;
  const now = new Date().toISOString();
  check(await db.from("dm_threads").update({ status: "open", last_message_at: now, last_preview: content.slice(0, 120), last_sender: "player", player_last_read_at: now, unread_count: 0 }).eq("id", thread.id), "dm_touch");
  check(await db.from("player_world_state").update({ last_action_at: now }).eq("id", player.id), "dm_touch_player");

  const payload = { thread_id: thread.id, message_id: message.id, local_ai: !!opts.localAi };
  await scheduleJob(db, world.id, "dm_reply", payload, new Date(Date.now() + 45_000), `dmr:${message.id}`);
  runInBackground(processDmReply(db, world, payload, true));
  return { threadId: thread.id, message };
}

/**
 * Read, think, type, answer. Idempotent: skips if the SIM already answered after
 * this message, or the player sent a newer message (which gets its own reply).
 */
export async function processDmReply(db: Db, world: WorldRow, p: { thread_id: string; message_id: string; local_ai?: boolean }, live: boolean): Promise<void> {
  const thread = check(await db.from("dm_threads").select("*").eq("id", p.thread_id).maybeSingle(), "dmr_thread") as DmThreadRow | null;
  const msg = check(await db.from("dm_messages").select("*").eq("id", p.message_id).maybeSingle(), "dmr_msg") as DmMessageRow | null;
  if (!thread || !msg) return;
  const rng = new Rng(`${world.seed}:dmr:${msg.id}`);

  if (live) await sleep(rng.int(1800, 6000)); // a moment before they open it
  const after = check(await db.from("dm_messages").select("id, sender_type").eq("thread_id", thread.id).gt("created_at", msg.created_at).limit(5), "dmr_after") as { id: string; sender_type: string }[];
  if (after.some((m) => m.sender_type === "sim")) return; // already answered
  if (after.some((m) => m.sender_type === "player")) return; // a newer message will get the reply
  // An on-device AI task already covers this message (pending or done).
  const task = check(await db.from("local_ai_tasks").select("id").eq("thread_id", thread.id).contains("prompt", { message_id: msg.id }).limit(1), "dmr_task") as unknown[];
  if (task.length) return;

  const sim = await loadSim(db, world.id, thread.sim_id);
  const player = check(await db.from("player_world_state").select("*").eq("id", thread.player_id).maybeSingle(), "dmr_player") as PlayerRow | null;
  if (!sim || !player) return;

  const history = check(await db.from("dm_messages").select("sender_type, content, created_at").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(30), "dmr_hist") as { sender_type: string; content: string; created_at: string }[];
  // Everything the player sent since the SIM's last message is read as one burst.
  const burst: string[] = [];
  for (const h of history) {
    if (h.sender_type === "sim") break;
    burst.unshift(h.content);
  }
  const playerText = burst.join(" ") || msg.content;
  const rel = await relScore(db, world.id, sim.id, player.id);
  const memory = check(await db.from("account_memories").select("summary, sentiment").eq("simulated_account_id", sim.id).eq("related_entity_id", player.id).order("importance", { ascending: false }).limit(1), "dmr_mem") as { summary: string; sentiment: number }[];
  const lastPost = check(await db.from("posts").select("content").eq("author_player_id", player.id).is("deleted_at", null).neq("post_type", "reply").order("created_at", { ascending: false }).limit(1), "dmr_post") as { content: string }[];
  const intent = classifyDm(playerText);
  const sims = history.filter((h) => h.sender_type === "sim");
  const prevPlayer = history.find((h, i) => h.sender_type === "player" && i >= burst.length);
  const usage = await ensureLedger(db, world.id);
  const out = dmReply({
    intent, playerText, playerUsername: player.username, simArchetype: sim.archetype, topic: sim.interests[0], voice: voiceOf(sim), relationship: rel,
    simFame: sim.fame, playerFame: player.fame, historyCount: history.length, simGreeted: history.some((h) => h.sender_type === "sim"),
    memory: memory[0] && memory[0].sentiment > 0 ? memory[0].summary.replace(/^@\S+\s*/, "").toLowerCase() : null,
    recentPostHook: lastPost[0] ? extractHook(lastPost[0].content) : null,
    recentSimTexts: sims.slice(0, 6).map((h) => h.content),
    lastSimText: sims[0]?.content ?? null,
    prevPlayerText: prevPlayer?.content ?? null,
    simGoal: sim.current_goals?.[0] ?? null,
    usage,
  }, rng);
  await flushLedgers(db, world.id);

  // Seen.
  check(await db.from("dm_threads").update({ sim_last_read_at: new Date().toISOString() }).eq("id", thread.id), "dmr_seen");
  if (out.relDelta) await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "dm", reason: out.relDelta > 0 ? "a friendly DM" : "a hostile DM", multiplier: out.relDelta, hostile: out.relDelta < -4 });
  if (intent === "hostile") await remember(db, world.id, sim.id, { entityType: "player", entityId: player.id, type: "public_dispute", summary: `@${player.username} sent me a hostile DM`, importance: 0.6, sentiment: -0.7 });
  if (out.seenOnly) return;

  // On-device AI: hand the draft to the player's browser; a job publishes the draft if it never answers.
  if (p.local_ai && live) {
    const expires = new Date(Date.now() + LOCAL_AI_WINDOW_MS);
    const ins = check(await db.from("local_ai_tasks").insert({
      world_id: world.id, thread_id: thread.id, player_id: player.id, sim_id: sim.id, draft: out.messages, expires_at: expires.toISOString(),
      prompt: {
        message_id: msg.id, collab: out.collab, username: sim.username, display_name: sim.display_name, archetype: sim.archetype, style: sim.communication_style,
        bio: (sim as unknown as { bio?: string }).bio ?? "", interests: sim.interests.slice(0, 3), relationship: rel, player: player.username,
        history: history.slice(0, 8).reverse().map((h) => ({ from: h.sender_type, text: h.content.slice(0, 280) })),
      },
    }).select("id").single(), "dmr_task_insert") as { id: string };
    check(await db.from("dm_threads").update({ sim_typing_until: expires.toISOString() }).eq("id", thread.id), "dmr_task_typing");
    await scheduleJob(db, world.id, "dm_local_fallback", { task_id: ins.id }, new Date(expires.getTime() + 2_000), `dmlf:${ins.id}`);
    return;
  }

  if (live) await sleep(rng.int(800, 3500)); // thinking
  let t = Date.now();
  for (let i = 0; i < out.messages.length; i++) {
    const text = out.messages[i];
    const typing = typingMs(text, rng);
    if (live) {
      check(await db.from("dm_threads").update({ sim_typing_until: new Date(Date.now() + typing + 1500).toISOString() }).eq("id", thread.id), "dmr_typing");
      await sleep(typing);
      // Stop if the player interrupted with a new message mid-typing (it gets its own reply).
      const interrupted = check(await db.from("dm_messages").select("id").eq("thread_id", thread.id).eq("sender_type", "player").gt("created_at", msg.created_at).limit(1), "dmr_int") as unknown[];
      if (interrupted.length) {
        check(await db.from("dm_threads").update({ sim_typing_until: null }).eq("id", thread.id), "dmr_untype");
        return;
      }
    }
    t += live ? 0 : typing;
    await insertSimMessage(db, world, thread.id, text, "text", {}, live ? undefined : new Date(t).toISOString());
  }
  await finishSimReply(db, world, thread.id, sim, player, out.messages.at(-1) ?? "", out.collab);
}

const LOCAL_AI_WINDOW_MS = 40_000;

async function finishSimReply(db: Db, world: WorldRow, threadId: string, sim: SimRow, player: PlayerRow, last: string, collab: boolean): Promise<void> {
  check(await db.from("dm_threads").update({ sim_typing_until: null }).eq("id", threadId), "dmr_done");
  await notify(db, world.id, player.user_id, { type: "dm", title: `@${sim.username} sent you a message`, body: last, sourceType: "dm", sourceId: threadId, actorId: sim.id, batchKey: `dm:${threadId}` });
  if (collab) {
    const pending = check(await db.from("notifications").select("id").eq("recipient_user_id", player.user_id).eq("world_id", world.id).eq("notification_type", "collaboration_invite").eq("action_state", "pending").contains("actor_ids", [sim.id]).limit(1), "dmr_collab") as unknown[];
    if (!pending.length) await notify(db, world.id, player.user_id, { type: "collaboration_invite", title: `@${sim.username} wants to collaborate`, body: `Agreed in DMs: a joint ${sim.interests[0]} project with ${sim.display_name}.`, actorId: sim.id, sourceType: "sim", sourceId: sim.id, priority: 3, actionState: "pending" });
  }
}

interface LocalTaskRow {
  id: string;
  world_id: string;
  thread_id: string;
  player_id: string;
  sim_id: string;
  prompt: Record<string, unknown>;
  draft: string[];
  status: "pending" | "done" | "fallback";
  created_at: string;
  expires_at: string;
}

/** The pending on-device AI task for a thread, shaped for the browser. */
export async function pendingLocalTask(db: Db, threadId: string) {
  const rows = check(await db.from("local_ai_tasks").select("id, prompt, draft, expires_at").eq("thread_id", threadId).eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1), "dm_local_task") as Pick<LocalTaskRow, "id" | "prompt" | "draft" | "expires_at">[];
  const t = rows[0];
  if (!t) return null;
  const { message_id: _m, collab: _c, ...prompt } = t.prompt;
  return { id: t.id, draft: t.draft, expiresAt: t.expires_at, prompt };
}

const BANNED = /\b(kill yourself|kys|n[i1]gg|f[a@]gg|retard)\w*/i;

/** Accept the browser's on-device rewrite (or its explicit "use draft") for a task. */
export async function submitLocalAi(db: Db, world: WorldRow, player: PlayerRow, taskId: string, raw: unknown): Promise<{ ok: true; used: "local" | "draft" }> {
  const claimed = check(await db.from("local_ai_tasks").update({ status: "done" }).eq("id", taskId).eq("player_id", player.id).eq("status", "pending").select("*"), "local_claim") as LocalTaskRow[];
  const task = claimed[0];
  if (!task) throw new HttpError(409, "This reply was already sent.", "already_responded");
  let msgs = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.length > 0 && x.length <= 400).slice(0, 3) : [];
  const leaksPrompt = msgs.some((m) => /\b(as an ai|language model|i'm an ai|i am an ai|system prompt|assistant:)\b/i.test(m));
  const used: "local" | "draft" = msgs.length && !leaksPrompt && !msgs.some((m) => BANNED.test(m)) ? "local" : "draft";
  if (used === "draft") msgs = task.draft;
  await deliverTask(db, world, task, msgs, used);
  return { ok: true, used };
}

/** Job: publish the server draft when the browser did not answer in time. */
export async function localAiFallback(db: Db, world: WorldRow, taskId: string): Promise<void> {
  const claimed = check(await db.from("local_ai_tasks").update({ status: "fallback" }).eq("id", taskId).eq("status", "pending").select("*"), "local_fallback") as LocalTaskRow[];
  if (claimed[0]) await deliverTask(db, world, claimed[0], claimed[0].draft, "draft");
}

async function deliverTask(db: Db, world: WorldRow, task: LocalTaskRow, msgs: string[], source: "local" | "draft"): Promise<void> {
  const sim = await loadSim(db, world.id, task.sim_id);
  const player = check(await db.from("player_world_state").select("*").eq("id", task.player_id).maybeSingle(), "local_player") as PlayerRow | null;
  if (!sim || !player) return;
  let t = Date.now();
  for (const m of msgs) {
    t += 1200;
    await insertSimMessage(db, world, task.thread_id, m, "text", source === "local" ? { local_ai: true } : {}, new Date(t).toISOString());
  }
  await finishSimReply(db, world, task.thread_id, sim, player, msgs.at(-1) ?? "", task.prompt.collab === true);
}

async function insertSimMessage(db: Db, world: WorldRow, threadId: string, content: string, kind: "text" | "offer" | "system", meta: Record<string, unknown>, at?: string): Promise<DmMessageRow> {
  const row: Record<string, unknown> = { world_id: world.id, thread_id: threadId, sender_type: "sim", content: content.slice(0, 1000), kind, meta };
  if (at) row.created_at = at;
  const m = check(await db.from("dm_messages").insert(row).select("*").single(), "dm_sim_insert") as DmMessageRow;
  const cur = check(await db.from("dm_threads").select("unread_count").eq("id", threadId).single(), "dm_unread") as { unread_count: number };
  check(await db.from("dm_threads").update({ last_message_at: m.created_at, last_preview: content.slice(0, 120), last_sender: "sim", unread_count: cur.unread_count + 1 }).eq("id", threadId), "dm_sim_touch");
  return m;
}

/** SIMs sometimes message the player first: fans, allies, rivals, reporters and brands. */
export async function simInitiatedDms(db: Db, world: WorldRow, player: PlayerRow, rng: Rng): Promise<number> {
  if (player.post_count === 0) return 0;
  const options: { kind: DmOpenerKind; p: number }[] = [];
  if (player.viral_posts > 0 || player.fame > 8) options.push({ kind: "fan", p: 0.08 });
  options.push({ kind: "ally", p: 0.06 }, { kind: "rival", p: 0.05 }, { kind: "peer", p: 0.03 });
  if (player.controversy > 25) options.push({ kind: "journalist", p: 0.1 });
  if (player.fame >= 15) options.push({ kind: "brand", p: 0.05 });
  const hit = options.find((o) => rng.chance(o.p));
  if (!hit) return 0;

  let simId: string | null = null;
  if (hit.kind === "ally" || hit.kind === "rival") {
    const q = db.from("relationships").select("account_a_id").eq("world_id", world.id).eq("account_b_id", player.id).eq("account_a_type", "sim");
    const rows = check(await (hit.kind === "ally" ? q.gte("relationship_score", 28) : q.lte("relationship_score", -20)).limit(10), "dm_rel_pick") as { account_a_id: string }[];
    if (rows.length) simId = rng.pick(rows).account_a_id;
  } else if (hit.kind === "fan" || hit.kind === "peer") {
    const rows = check(await db.from("follows").select("follower_simulated_account_id").eq("followed_player_id", player.id).eq("follower_type", "sim").limit(60), "dm_fan_pick") as { follower_simulated_account_id: string }[];
    if (rows.length) simId = rng.pick(rows).follower_simulated_account_id;
  } else {
    const archetypes = hit.kind === "journalist" ? ["journalist"] : ["entrepreneur", "brand", "established_creator"];
    const rows = check(await db.from("simulated_accounts").select("id").eq("world_id", world.id).eq("account_status", "active").in("archetype", archetypes).limit(30), "dm_arch_pick") as { id: string }[];
    if (rows.length) simId = rng.pick(rows).id;
  }
  if (!simId) return 0;
  const blocked = check(await db.from("player_filters").select("id").eq("player_id", player.id).eq("target_simulated_account_id", simId).maybeSingle(), "dm_init_block");
  if (blocked) return 0;
  const sim = await loadSim(db, world.id, simId);
  if (!sim || sim.account_status !== "active") return 0;
  if (hit.kind === "fan" && sim.fame > player.fame + 10) return 0;

  const existing = check(await db.from("dm_threads").select("*").eq("player_id", player.id).eq("sim_id", sim.id).maybeSingle(), "dm_init_existing") as DmThreadRow | null;
  if (existing && Date.now() - Date.parse(existing.last_message_at) < 12 * 3_600_000) return 0;
  const rel = await relScore(db, world.id, sim.id, player.id);
  const follows = check(await db.from("follows").select("id").eq("follower_player_id", player.id).eq("followed_simulated_account_id", sim.id).maybeSingle(), "dm_init_follow");
  const thread = existing ?? await findOrCreateThread(db, world, player.id, sim.id, rel < 10 && !follows ? "request" : "open");

  const top = check(await db.from("posts").select("content, topic_id").eq("author_player_id", player.id).is("deleted_at", null).neq("post_type", "reply").order("like_count", { ascending: false }).limit(1), "dm_init_top") as { content: string; topic_id: string }[];
  const topic = top[0]?.topic_id ?? sim.interests[0];
  const text = dmOpener(hit.kind, { topic, hook: top[0] ? extractHook(top[0].content) : null, playerUsername: player.username, usage: ledgerFor(world.id) }, voiceOf(sim), rng);
  await insertSimMessage(db, world, thread.id, text, "text", {});
  if (hit.kind === "brand") {
    const fee = Math.round(clamp(player.fame, 15, 100) * 12 + rng.int(0, 200));
    await insertSimMessage(db, world, thread.id, `Sponsored post offer: one post about ${sim.display_name}. Fee: ${fee} credits. You keep creative control, but it will be labeled as an ad.`, "offer", { status: "pending", fee });
  }
  await notify(db, world.id, player.user_id, {
    type: "dm", title: thread.status === "request" ? `Message request from @${sim.username}` : `@${sim.username} sent you a message`, body: text,
    sourceType: "dm", sourceId: thread.id, actorId: sim.id, priority: hit.kind === "brand" || hit.kind === "journalist" ? 2 : 1,
  });
  return 1;
}

/** Accept or decline a sponsorship offer received in DMs. */
export async function respondDmOffer(db: Db, world: WorldRow, player: PlayerRow, messageId: string, accept: boolean): Promise<{ summary: string }> {
  const msg = check(await db.from("dm_messages").select("*").eq("id", messageId).maybeSingle(), "offer_msg") as DmMessageRow | null;
  if (!msg || msg.kind !== "offer") throw new HttpError(404, "Offer not found.", "not_found");
  const thread = check(await db.from("dm_threads").select("*").eq("id", msg.thread_id).maybeSingle(), "offer_thread") as DmThreadRow | null;
  if (!thread || thread.player_id !== player.id) throw new HttpError(404, "Offer not found.", "not_found");
  if (msg.meta?.status !== "pending") throw new HttpError(409, "You already answered this offer.", "already_responded");
  const updated = check(await db.from("dm_messages").update({ meta: { ...msg.meta, status: accept ? "accepted" : "declined" } }).eq("id", msg.id).eq("meta->>status", "pending").select("id"), "offer_update") as unknown[];
  if (!updated.length) throw new HttpError(409, "You already answered this offer.", "already_responded");
  const sim = await loadSim(db, world.id, thread.sim_id);
  const rng = new Rng(`${world.seed}:offer:${msg.id}`);
  if (accept) {
    await applyReputation(db, world, player, [
      { attribute: "fame", delta: 1.5, reason: `Sponsored post for @${sim?.username ?? "a brand"}` },
      { attribute: "credibility", delta: -2, reason: "Took a paid sponsorship" },
      { attribute: "audience_loyalty", delta: -1, reason: "Some followers dislike ads" },
    ], { snapshotLabel: "Took a sponsorship" });
    if (sim) await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "sponsor_accepted", reason: "you accepted their sponsorship" });
    await insertSimMessage(db, world, thread.id, rng.pick(["Amazing, thank you! Excited to work together.", "Perfect. We'll send the brief shortly.", "Great news. Looking forward to the post!"]), "text", {});
    return { summary: "Deal accepted. Your reach grew a little, but some followers noticed the ad." };
  }
  await applyReputation(db, world, player, [{ attribute: "credibility", delta: 0.5, reason: "Turned down a sponsorship" }], { skipSnapshot: true });
  if (sim) await updateRelationship(db, world.id, { aType: "sim", aId: sim.id, bType: "player", bId: player.id, kind: "sponsor_declined", reason: "you declined their sponsorship" });
  await insertSimMessage(db, world, thread.id, rng.pick(["No problem, maybe next time.", "Understood. The offer stands if you change your mind.", "All good, thanks for considering it."]), "text", {});
  return { summary: "You passed on the deal. Your audience trusts you a little more." };
}

export async function dmList(db: Db, player: PlayerRow) {
  const threads = check(await db.from("dm_threads").select("*").eq("player_id", player.id).order("last_message_at", { ascending: false }).limit(60), "dm_list") as DmThreadRow[];
  const sims = threads.length ? check(await db.from("simulated_accounts").select(AUTHOR_COLS).in("id", threads.map((t) => t.sim_id)), "dm_list_sims") as { id: string }[] : [];
  const map = new Map(sims.map((s) => [s.id, s]));
  return {
    threads: threads.map((t) => ({ ...t, typing: !!t.sim_typing_until && Date.parse(t.sim_typing_until) > Date.now(), sim: map.get(t.sim_id) ?? null })),
    unread: threads.reduce((n, t) => n + t.unread_count, 0),
  };
}

export async function dmThread(db: Db, world: WorldRow, player: PlayerRow, opts: { threadId?: string | null; simId?: string | null }) {
  let thread: DmThreadRow | null = null;
  if (opts.threadId) thread = check(await db.from("dm_threads").select("*").eq("id", opts.threadId).eq("player_id", player.id).maybeSingle(), "dm_thread") as DmThreadRow | null;
  else if (opts.simId) thread = check(await db.from("dm_threads").select("*").eq("player_id", player.id).eq("sim_id", opts.simId).maybeSingle(), "dm_thread_sim") as DmThreadRow | null;
  const simId = thread?.sim_id ?? opts.simId;
  if (!simId) throw new HttpError(404, "Conversation not found.", "not_found");
  const sim = check(await db.from("simulated_accounts").select(AUTHOR_COLS + ", bio").eq("world_id", world.id).eq("id", simId).maybeSingle(), "dm_thread_sim_load");
  if (!sim) throw new HttpError(404, "Account not found.", "not_found");
  const messages = thread ? (check(await db.from("dm_messages").select("*").eq("thread_id", thread.id).order("created_at", { ascending: false }).limit(100), "dm_msgs") as DmMessageRow[]).reverse() : [];
  if (thread && (thread.unread_count > 0 || !thread.player_last_read_at)) {
    check(await db.from("dm_threads").update({ unread_count: 0, player_last_read_at: new Date().toISOString() }).eq("id", thread.id), "dm_mark_read");
    thread = { ...thread, unread_count: 0 };
  }
  const relRow = check(await db.from("relationships").select("relationship_score, relationship_status").eq("world_id", world.id).eq("account_a_id", simId).eq("account_b_id", player.id).maybeSingle(), "dm_thread_rel") as { relationship_score: number; relationship_status: string } | null;
  const pendingTask = thread ? await pendingLocalTask(db, thread.id) : null;
  return {
    thread: thread ? { ...thread, typing: !!thread.sim_typing_until && Date.parse(thread.sim_typing_until) > Date.now() } : null,
    sim,
    messages,
    relationship: relRow ?? { relationship_score: 0, relationship_status: "stranger" },
    localTask: pendingTask,
  };
}

export async function unreadDms(db: Db, playerId: string): Promise<number> {
  const rows = check(await db.from("dm_threads").select("unread_count").eq("player_id", playerId).gt("unread_count", 0), "dm_unread_total") as { unread_count: number }[];
  return rows.reduce((n, r) => n + r.unread_count, 0);
}
