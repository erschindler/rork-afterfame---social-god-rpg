/** Tunable simulation constants and limits. */

export type WorldSize = "small" | "standard" | "large";
export type WorldPace = "relaxed" | "standard" | "fast";
export type WorldTheme =
  | "mainstream"
  | "gaming"
  | "tech"
  | "entertainment"
  | "politics"
  | "creator"
  | "underground"
  | "mixed";

export const POPULATION: Record<WorldSize, number> = { small: 100, standard: 500, large: 1500 };

/** Real seconds per simulation tick. Pace changes time, not fairness. */
export const TICK_SECONDS: Record<WorldPace, number> = { relaxed: 1800, standard: 900, fast: 300 };

export const LIMITS = {
  maxPostLength: 280,
  postsPer10Min: 6,
  postsPerDay: 80,
  actionsPerMinute: 40,
  maxPendingJobsPerWorld: 200,
  jobsPerSync: 8,
  maxCatchUpTicks: 6,
  tickBudgetMs: 12_000,
  feedPageSize: 25,
  maxFeedPageSize: 40,
  stage1Candidates: 70,
  stage2Candidates: 90,
  stage3Candidates: 140,
  textModelTimeoutMs: 4000,
  textModelMaxAttempts: 1,
};

export const THEME_TOPICS: Record<WorldTheme, string[]> = {
  mainstream: ["everyday", "celebs", "memes", "sports", "food", "music", "film", "tech", "fitness"],
  gaming: ["gaming", "speedrunning", "streaming", "indiedev", "memes", "tech", "creator"],
  tech: ["tech", "startups", "ai", "programming", "science", "finance", "indiedev"],
  entertainment: ["celebs", "film", "music", "comedy", "memes", "books", "art"],
  politics: ["politics", "science", "finance", "everyday", "books", "tech"],
  creator: ["creator", "streaming", "art", "memes", "startups", "music", "fitness"],
  underground: ["internet", "memes", "art", "music", "gaming", "programming"],
  mixed: [
    "gaming", "tech", "music", "film", "memes", "sports", "politics", "science", "art",
    "creator", "everyday", "startups", "comedy", "food", "indiedev", "speedrunning",
  ],
};

export const ALL_TOPICS = [
  "gaming", "speedrunning", "streaming", "indiedev", "tech", "startups", "ai", "programming",
  "music", "film", "celebs", "comedy", "memes", "sports", "politics", "science", "art", "books",
  "food", "fitness", "everyday", "creator", "internet", "finance",
];

export const TOPIC_CATEGORY: Record<string, string> = {
  gaming: "gaming", speedrunning: "gaming", streaming: "gaming", indiedev: "technology",
  tech: "technology", startups: "technology", ai: "technology", programming: "technology",
  music: "entertainment", film: "entertainment", celebs: "entertainment", comedy: "humor",
  memes: "humor", sports: "sports", politics: "public_affairs", science: "technology", art: "culture",
  books: "culture", food: "everyday", fitness: "everyday", everyday: "everyday", creator: "creator_drama",
  internet: "culture", finance: "technology",
};

export interface RankDef {
  name: string;
  minFame: number;
  minFollowerShare: number;
  minInfluence: number;
  minReachShare: number;
  minViral: number;
}

/** Follower and reach gates are shares of the world population so every world size is fair. */
export const FAME_RANKS: RankDef[] = [
  { name: "Nobody", minFame: 0, minFollowerShare: 0, minInfluence: 0, minReachShare: 0, minViral: 0 },
  { name: "Recognized", minFame: 8, minFollowerShare: 0.03, minInfluence: 0, minReachShare: 0.1, minViral: 0 },
  { name: "Rising Name", minFame: 20, minFollowerShare: 0.08, minInfluence: 12, minReachShare: 0.3, minViral: 0 },
  { name: "Notable", minFame: 38, minFollowerShare: 0.15, minInfluence: 25, minReachShare: 0.6, minViral: 1 },
  { name: "Celebrity", minFame: 58, minFollowerShare: 0.25, minInfluence: 40, minReachShare: 1.2, minViral: 2 },
  { name: "Cultural Force", minFame: 76, minFollowerShare: 0.38, minInfluence: 58, minReachShare: 2.5, minViral: 4 },
  { name: "Legend", minFame: 90, minFollowerShare: 0.5, minInfluence: 75, minReachShare: 5, minViral: 7 },
];

export const NOTORIETY_RANKS: { name: string; minInfamy: number }[] = [
  { name: "Unknown", minInfamy: 0 },
  { name: "Troublemaker", minInfamy: 12 },
  { name: "Notorious", minInfamy: 30 },
  { name: "Internet Villain", minInfamy: 55 },
  { name: "Infamous Legend", minInfamy: 80 },
];
