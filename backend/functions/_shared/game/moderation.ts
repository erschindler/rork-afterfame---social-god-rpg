/**
 * Simulated moderation review. Reports are queued and resolved a few minutes
 * later by a rule-based reviewer: hostile SIM content is removed, other reports
 * are reviewed or dismissed, and the reporter is told the outcome.
 */
import { check, type Db } from "../http.ts";
import { analyzePost } from "../sim/analyze.ts";
import { clamp } from "../sim/rng.ts";
import type { PostRow, WorldRow } from "./types.ts";
import { notify } from "./store.ts";

const HOSTILE_STANCES = new Set(["dunk", "escalate", "pile_on", "feud_jab", "critique"]);

interface ReportRow {
  id: string;
  world_id: string;
  reporter_user_id: string;
  target_entity_type: "post" | "sim" | "player";
  target_entity_id: string;
  reason: string;
  status: string;
}

function hostility(content: string, stance: string | null): number {
  const s = analyzePost(content, { fallbackTopic: "everyday", recentOwnPosts: [] });
  return s.aggression + (HOSTILE_STANCES.has(stance ?? "") ? 0.3 : 0);
}

export async function reviewReport(db: Db, world: WorldRow, reportId: string): Promise<void> {
  const r = check(await db.from("moderation_reports").select("*").eq("id", reportId).maybeSingle(), "load_report") as ReportRow | null;
  if (!r || r.status !== "open") return;
  let status: "actioned" | "reviewed" | "dismissed" = "dismissed";
  let body = "We didn't find a rule violation. Thanks for helping keep the world healthy.";

  if (r.target_entity_type === "post") {
    const post = check(await db.from("posts").select("*").eq("id", r.target_entity_id).eq("world_id", world.id).maybeSingle(), "report_post") as PostRow | null;
    if (post && !post.deleted_at) {
      const h = hostility(post.content, post.stance);
      if (h >= 0.45) {
        status = "actioned";
        body = "The post was removed for harassment.";
        check(await db.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", post.id), "report_remove");
        if (post.author_simulated_account_id) {
          const sim = check(await db.from("simulated_accounts").select("credibility, infamy").eq("id", post.author_simulated_account_id).single(), "report_sim") as { credibility: number; infamy: number };
          check(await db.from("simulated_accounts").update({ credibility: clamp(sim.credibility - 2, 0, 100), infamy: clamp(sim.infamy + 1, 0, 100) }).eq("id", post.author_simulated_account_id), "report_sim_pen");
        }
      } else if (h >= 0.25) {
        status = "reviewed";
        body = "We reviewed the post. It's heated but within the rules, so it stays up.";
      }
    } else {
      status = "reviewed";
      body = "That post is no longer available.";
    }
  } else if (r.target_entity_type === "sim") {
    const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const posts = check(await db.from("posts").select("id, content, stance").eq("author_simulated_account_id", r.target_entity_id).is("deleted_at", null).gte("created_at", since).limit(40), "report_sim_posts") as { id: string; content: string; stance: string | null }[];
    const bad = posts.filter((p) => hostility(p.content, p.stance) >= 0.45);
    if (bad.length >= 2) {
      status = "actioned";
      body = `We removed ${bad.length} posts from this account and issued a warning.`;
      check(await db.from("posts").update({ deleted_at: new Date().toISOString() }).in("id", bad.map((b) => b.id)), "report_sim_remove");
      const sim = check(await db.from("simulated_accounts").select("credibility, infamy").eq("id", r.target_entity_id).single(), "report_sim2") as { credibility: number; infamy: number };
      check(await db.from("simulated_accounts").update({ credibility: clamp(sim.credibility - 4, 0, 100), infamy: clamp(sim.infamy + 3, 0, 100) }).eq("id", r.target_entity_id), "report_sim_pen2");
    } else if (bad.length === 1) {
      status = "reviewed";
      body = "We reviewed the account and noted one borderline post.";
    }
  } else {
    status = "reviewed";
    body = "We reviewed the account. Reports about real people are logged for the world owner.";
  }

  check(await db.from("moderation_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", r.id).eq("status", "open"), "report_close");
  await notify(db, world.id, r.reporter_user_id, {
    type: "moderation", title: status === "actioned" ? "Action taken on your report" : status === "reviewed" ? "Your report was reviewed" : "Report closed",
    body, sourceType: "report", sourceId: r.id, priority: status === "actioned" ? 2 : 1,
  });
}

export async function listReports(db: Db, world: WorldRow, userId: string) {
  return check(await db.from("moderation_reports").select("id, target_entity_type, target_entity_id, reason, status, created_at, reviewed_at").eq("world_id", world.id).eq("reporter_user_id", userId).order("created_at", { ascending: false }).limit(30), "list_reports");
}
