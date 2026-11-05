/**
 * Live multi-turn conversations in reply threads. A conversation is a chain of
 * `converse` jobs: each job writes exactly one reply, then schedules the next
 * turn after a human-feeling delay that depends on how heated the exchange is.
 * Players can be participants (people answer and address them) but are never
 * chosen as speakers.
 */
import { check, type Db } from "../http.ts";
import { clamp, Rng } from "../sim/rng.ts";
import {
  actFromStance, chooseAct, type DialogueAct, generateDialogue, isDialogueAct, nextHeat, type Participant, pickTeam, sideBetween, type Team, turnDelayMs,
} from "../sim/dialogue.ts";
import { SIM_COLUMNS, type PostRow, type SimRow, type WorldRow } from "./types.ts";
import { notify, updateRelationship } from "./store.ts";
import { scheduleJob } from "./distribute.ts";
import { voiceOf } from "./util.ts";
import { ensureLedger, flushLedgers, ledgerFor } from "./usage.ts";

export interface ConvParticipant extends Participant {
  player?: boolean;
}

export interface ConversePayload {
  root_id: string;
  parent_id: string;
  participants: ConvParticipant[];
  turn: number;
  heat: number;
  last_act: DialogueAct | null;
  max_turns: number;
  used: string[];
  friend?: { id: string; username: string } | null;
}

const ADDRESSING = new Set<DialogueAct>(["ask_followup", "evidence_request", "counter", "rebut", "escalate", "tag_friend"]);
const STARTER_INTENTS = ["hot_take", "question", "feud_jab", "news_reaction", "opinion", "observation"];

/** Kick off a conversation under a SIM-authored reply so others join in. */
export async function scheduleConversation(db: Db, world: WorldRow, opts: { rootId: string; parentId: string; participants: ConvParticipant[]; lastAct: DialogueAct | null; heat: number; rng: Rng; delayMs?: number }): Promise<void> {
  const payload: ConversePayload = {
    root_id: opts.rootId, parent_id: opts.parentId, participants: opts.participants.slice(0, 8), turn: 1, heat: clamp(opts.heat, 0.15, 1),
    last_act: opts.lastAct, max_turns: opts.rng.int(4, 12), used: [], friend: null,
  };
  const delay = opts.delayMs ?? turnDelayMs(payload.heat, opts.lastAct ?? "counter", opts.rng);
  await scheduleJob(db, world.id, "converse", payload as unknown as Record<string, unknown>, new Date(Date.now() + delay), `conv:${opts.parentId}:1`);
}

/** Pick 1-3 fresh SIM posts and start a reply conversation under each. */
export async function startTickConversations(db: Db, world: WorldRow, slice: SimRow[], rng: Rng): Promise<number> {
  const since = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const recent = check(await db.from("posts").select("*").eq("world_id", world.id).eq("author_type", "sim").eq("post_type", "post").is("deleted_at", null).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(30), "conv_candidates") as PostRow[];
  const fresh = recent.filter((p) => p.reply_count < 6);
  if (!fresh.length || !slice.length) return 0;
  const n = Math.min(fresh.length, rng.int(1, 3));
  let started = 0;
  const picked = new Set<string>();
  for (let i = 0; i < n * 3 && started < n; i++) {
    const post = rng.weighted(fresh, (p) => (STARTER_INTENTS.includes(p.stance ?? "") ? 3 : 1) * (picked.has(p.id) ? 0 : 1) * (1 + Math.min(p.like_count, 200) / 100));
    if (picked.has(post.id)) continue;
    picked.add(post.id);
    const op = slice.find((s) => s.id === post.author_simulated_account_id) ?? await loadSim(db, post.author_simulated_account_id!);
    if (!op) continue;
    const responders = slice.filter((s) => s.id !== op.id && s.interests.includes(post.topic_id ?? ""));
    if (!responders.length) continue;
    const speaker = rng.weighted(responders, (s) => 0.4 + s.personality_traits.sociability + s.personality_traits.conflict_tolerance * (post.stance === "hot_take" ? 0.8 : 0.2));
    const r = rng.fork(`conv${post.id}`);
    const team = pickTeam(speaker.personality_traits, 0, r);
    const side = sideBetween(team, "pro");
    const act = chooseAct(null, side, speaker.personality_traits, 0.45, r, { prevIsQuestion: post.content.trim().endsWith("?") });
    const line = generateDialogue(act, { topic: post.topic_id ?? speaker.interests[0], prevContent: post.content, prevAuthor: op.username, opAuthor: op.username, side, heat: 0.45, usage: ledgerFor(world.id) }, voiceOf(speaker), r);
    const reply = check(await db.from("posts").insert({
      world_id: world.id, author_type: "sim", author_simulated_account_id: speaker.id, post_type: "reply", parent_post_id: post.id, root_post_id: post.id,
      content: line.text, topic_id: post.topic_id, stance: act, sim_tick: world.current_tick, like_count: r.int(0, 8),
    }).select("id").single(), "conv_first") as { id: string };
    await db.rpc("adjust_post_counts", { p: post.id, d_like: 0, d_reply: 1, d_repost: 0, d_quote: 0, d_view: 0 });
    const heat = nextHeat(0.5 + (post.stance === "hot_take" || post.stance === "feud_jab" ? 0.2 : 0), act);
    if (act !== "exit") {
      const payload: ConversePayload = {
        root_id: post.id, parent_id: reply.id, turn: 1, heat, last_act: act, max_turns: r.int(4, 12), used: [line.key], friend: null,
        participants: [{ id: op.id, username: op.username, team: "pro" }, { id: speaker.id, username: speaker.username, team }],
      };
      await scheduleJob(db, world.id, "converse", payload as unknown as Record<string, unknown>, new Date(Date.now() + turnDelayMs(heat, act, r)), `conv:${reply.id}:1`);
    }
    started++;
  }
  return started;
}

async function loadSim(db: Db, id: string): Promise<SimRow | null> {
  return check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("id", id).maybeSingle(), "conv_sim") as SimRow | null;
}

/** One conversational turn. */
export async function runConverse(db: Db, world: WorldRow, p: ConversePayload): Promise<void> {
  const parent = check(await db.from("posts").select("*").eq("id", p.parent_id).maybeSingle(), "conv_parent") as PostRow | null;
  const root = check(await db.from("posts").select("*").eq("id", p.root_id).maybeSingle(), "conv_root") as PostRow | null;
  if (!parent || !root || parent.deleted_at || root.deleted_at) return;
  const rng = new Rng(`${world.seed}:conv:${p.parent_id}:${p.turn}`);
  const participants = [...p.participants];
  const parentAuthorId = parent.author_simulated_account_id ?? parent.author_player_id;
  const prevSpeaker = participants.find((x) => x.id === parentAuthorId) ?? null;
  // The person the parent replied to.
  const grand = parent.parent_post_id ? check(await db.from("posts").select("author_simulated_account_id, author_player_id").eq("id", parent.parent_post_id).maybeSingle(), "conv_grand") as { author_simulated_account_id: string | null; author_player_id: string | null } | null : null;
  const grandId = grand?.author_simulated_account_id ?? grand?.author_player_id ?? null;
  const lastAct = isDialogueAct(p.last_act) ? p.last_act : actFromStance(parent.stance);

  // Choose the next speaker.
  type Cand = { kind: "existing"; part: ConvParticipant; w: number } | { kind: "newcomer"; w: number } | { kind: "friend"; w: number };
  const cands: Cand[] = [];
  if (lastAct === "tag_friend" && p.friend) cands.push({ kind: "friend", w: 100 });
  else {
    for (const part of participants) {
      if (part.player || part.exited || part.id === parentAuthorId) continue;
      const w = part.id === grandId ? (lastAct && ADDRESSING.has(lastAct) ? 8 : 5) : 1.5;
      cands.push({ kind: "existing", part, w });
    }
    cands.push({ kind: "newcomer", w: participants.length >= 6 ? 0.6 : 2 });
  }
  const choice = rng.weighted(cands, (c) => c.w);

  let speaker: SimRow | null = null;
  let speakerPart: ConvParticipant | null = null;
  let replyTo: PostRow = parent;
  let actPrev: DialogueAct | null = lastAct;
  if (choice.kind === "existing") {
    speaker = await loadSim(db, choice.part.id);
    speakerPart = choice.part;
  } else if (choice.kind === "friend" && p.friend) {
    speaker = await loadSim(db, p.friend.id);
    if (speaker) {
      speakerPart = { id: speaker.id, username: speaker.username, team: prevSpeaker?.team ?? "neutral" };
      participants.push(speakerPart);
    }
  } else {
    const taken = new Set(participants.map((x) => x.id));
    const pool = check(await db.from("simulated_accounts").select(SIM_COLUMNS).eq("world_id", world.id).eq("account_status", "active").contains("interests", [root.topic_id ?? "everyday"]).limit(80), "conv_pool") as SimRow[];
    const options = pool.filter((s) => !taken.has(s.id));
    if (options.length) {
      speaker = rng.weighted(options, (s) => 0.3 + s.personality_traits.sociability + s.personality_traits.conflict_tolerance * p.heat);
      const opId = root.author_simulated_account_id ?? root.author_player_id ?? "";
      const rel = check(await db.from("relationships").select("relationship_score").eq("world_id", world.id).eq("account_a_id", speaker.id).eq("account_b_id", opId).maybeSingle(), "conv_rel") as { relationship_score: number } | null;
      const team: Team = pickTeam(speaker.personality_traits, rel?.relationship_score ?? 0, rng);
      speakerPart = { id: speaker.id, username: speaker.username, team };
      participants.push(speakerPart);
      // Some newcomers start their own branch under the original post.
      if (rng.chance(0.2) && parent.id !== root.id) {
        replyTo = root;
        actPrev = null;
      }
    }
  }
  if (!speaker || !speakerPart) return;

  const targetId = replyTo.author_simulated_account_id ?? replyTo.author_player_id;
  const target = participants.find((x) => x.id === targetId) ?? { id: targetId ?? "", username: "", team: "pro" as Team };
  const targetName = target.username || (await authorName(db, replyTo));
  const opName = participants.find((x) => x.id === (root.author_simulated_account_id ?? root.author_player_id))?.username ?? (await authorName(db, root));
  const side = sideBetween(speakerPart.team, target.team);

  // A friend the speaker could summon.
  let friend: { id: string; username: string } | null = null;
  if (choice.kind !== "friend" && p.turn < p.max_turns - 1) {
    const follows = check(await db.from("follows").select("followed_simulated_account_id").eq("follower_simulated_account_id", speaker.id).eq("followed_type", "sim").limit(15), "conv_friends") as { followed_simulated_account_id: string }[];
    const ids = follows.map((f) => f.followed_simulated_account_id).filter((id) => !participants.some((x) => x.id === id));
    if (ids.length) {
      const f = await loadSim(db, rng.pick(ids));
      if (f && f.account_status === "active") friend = { id: f.id, username: f.username };
    }
  }

  const prevIsQuestion = replyTo.content.includes("?") && (targetId !== speaker.id) && (choice.kind !== "newcomer" || actPrev === null);
  let act: DialogueAct = choice.kind === "friend" ? "friend_arrive" : chooseAct(actPrev, side, speaker.personality_traits, p.heat, rng, { prevIsQuestion, canTag: !!friend, turn: p.turn });
  if (act === "tag_friend" && !friend) act = "ask_followup";
  const others = participants.filter((x) => x.id !== speaker!.id).map((x) => x.username);
  const line = generateDialogue(act, {
    topic: root.topic_id ?? speaker.interests[0], prevContent: replyTo.content, prevAuthor: targetName, opAuthor: opName, others,
    friend: act === "tag_friend" ? friend?.username : act === "friend_arrive" ? prevSpeaker?.username : undefined,
    multiParty: participants.length > 2, usedKeys: p.used, side, heat: p.heat, usage: await ensureLedger(db, world.id),
  }, voiceOf(speaker), rng);

  const likeBase = Math.round(p.heat * 12 + (act === "escalate" || act === "receipts" ? 6 : 0));
  check(await db.from("posts").insert({
    world_id: world.id, author_type: "sim", author_simulated_account_id: speaker.id, post_type: "reply", parent_post_id: replyTo.id, root_post_id: root.id,
    content: line.text, topic_id: root.topic_id, stance: act, sim_tick: world.current_tick, like_count: rng.int(0, Math.max(1, likeBase)),
  }), "conv_insert");
  await db.rpc("adjust_post_counts", { p: replyTo.id, d_like: 0, d_reply: 1, d_repost: 0, d_quote: 0, d_view: 0 });
  if (replyTo.id !== root.id) await db.rpc("adjust_post_counts", { p: root.id, d_like: 0, d_reply: 0, d_repost: 0, d_quote: 0, d_view: rng.int(1, 6) });

  // Effects on players being answered.
  if (replyTo.author_type === "player" && replyTo.author_player_id) {
    const pl = check(await db.from("player_world_state").select("id, user_id, username").eq("id", replyTo.author_player_id).maybeSingle(), "conv_player") as { id: string; user_id: string; username: string } | null;
    if (pl) {
      await notify(db, world.id, pl.user_id, { type: "reply", title: `@${speaker.username} replied to you`, body: line.text, sourceType: "post", sourceId: root.id, actorId: speaker.id, priority: side === "opponent" ? 2 : 1 });
      if (side !== "neutral") {
        await updateRelationship(db, world.id, { aType: "sim", aId: speaker.id, bType: "player", bId: pl.id, kind: side === "ally" ? "agree_add" : act === "escalate" || act === "pile_on" ? "dunk" : "disagree", reason: side === "ally" ? "backed you up in a thread" : "argued with you in a thread", postId: replyTo.id, hostile: act === "escalate" || act === "pile_on" });
      }
    }
  } else if ((act === "escalate" || act === "pile_on") && targetId && target.username && !target.player) {
    await updateRelationship(db, world.id, { aType: "sim", aId: speaker.id, bType: "sim", bId: targetId, kind: "dunk", reason: "heated reply thread", postId: replyTo.id, hostile: true });
  }

  if (act === "exit") speakerPart.exited = true;
  const heat = nextHeat(p.heat, act);
  const turn = p.turn + 1;
  const keepGoing = (act !== "exit" || rng.chance(0.25)) && heat > 0.12 && turn <= p.max_turns;
  if (!keepGoing) return;
  // The reply we just wrote becomes the new parent.
  const latest = check(await db.from("posts").select("id").eq("author_simulated_account_id", speaker.id).eq("parent_post_id", replyTo.id).order("created_at", { ascending: false }).limit(1), "conv_latest") as { id: string }[];
  if (!latest.length) return;
  const next: ConversePayload = {
    root_id: root.id, parent_id: latest[0].id, participants, turn, heat, last_act: act, max_turns: p.max_turns,
    used: [...p.used, line.key].slice(-24), friend: act === "tag_friend" ? friend : null,
  };
  await scheduleJob(db, world.id, "converse", next as unknown as Record<string, unknown>, new Date(Date.now() + turnDelayMs(heat, act, rng)), `conv:${latest[0].id}:${turn}`);
}

async function authorName(db: Db, post: PostRow): Promise<string> {
  if (post.author_simulated_account_id) {
    const s = check(await db.from("simulated_accounts").select("username").eq("id", post.author_simulated_account_id).maybeSingle(), "conv_name") as { username: string } | null;
    return s?.username ?? "someone";
  }
  const pl = check(await db.from("player_world_state").select("username").eq("id", post.author_player_id ?? "").maybeSingle(), "conv_pname") as { username: string } | null;
  return pl?.username ?? "someone";
}
