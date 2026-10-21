/**
 * Engagement calibration: prints average reaction rates for sample posts
 * against a generated population. Run: deno run backend/scripts/calibrate.ts
 */
import { Rng } from "../functions/_shared/sim/rng.ts";
import { generatePopulation } from "../functions/_shared/sim/population.ts";
import { analyzePost } from "../functions/_shared/sim/analyze.ts";
import { evaluateCandidate } from "../functions/_shared/sim/engagement.ts";

const pop = generatePopulation(1234, "gaming", 300);
const posts = [
  "ok",
  "lol the new patch nerfed the one boss everyone actually liked. cursed decision",
  "Hot take: glitchless speedrun categories are the only honest way to measure skill. Data from 40 leaderboards backs this up.",
  "Shipped my indie game after 14 months. Honest numbers: 212 wishlists became 1,900 after one devlog.",
  "you are all idiots and this community is trash",
];
for (const text of posts) {
  const signals = analyzePost(text, { fallbackTopic: "gaming", recentOwnPosts: [] });
  const rng = new Rng(text);
  let seen = 0, likes = 0, replies = 0, reposts = 0, quotes = 0, follows = 0, neg = 0;
  for (const s of pop) {
    const r = evaluateCandidate({
      id: s.username, archetype: s.archetype, traits: s.personality_traits, interests: s.interests, expertise: s.expertise, fame: s.fame,
      postsPerDay: s.activity_profile.postsPerDay, followsAuthor: false, via: s.interests.includes(signals.topic) ? "interest" : "broad",
      relationship: 0, hostileMemories: 0, positiveMemories: 0,
    }, signals, { fame: 2, credibility: 50, infamy: 0, nicheTopic: null, nicheAuthority: 0, fatigue: 0, followerCount: 8, population: 300 }, { stage: 1, socialProof: 0, isPlayerAuthor: true }, rng.fork(s.username));
    if (!r.seen) continue;
    seen++;
    if (r.like) likes++;
    if (r.reply) replies++;
    if (r.repost) reposts++;
    if (r.quote) quotes++;
    if (r.follow) follows++;
    if (r.reply && ["dunk", "critique", "disagree", "evidence_request"].includes(r.reply)) neg++;
  }
  const pct = (n: number) => `${((n / Math.max(1, seen)) * 100).toFixed(0)}%`;
  console.log(`q=${signals.quality} seen=${seen} like=${pct(likes)} reply=${pct(replies)} (neg ${neg}) repost=${pct(reposts)} quote=${quotes} follow=${follows} :: ${text.slice(0, 50)}`);
}
