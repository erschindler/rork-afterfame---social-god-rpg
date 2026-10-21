/** Community templates keyed by topic. Norms shape which posts gain traction. */
export interface CommunityDef {
  slug: string;
  name: string;
  description: string;
  topic: string;
  norms: { prefers: string[]; dislikes: string[]; summary: string };
}

export const COMMUNITY_DEFS: Record<string, CommunityDef> = {
  gaming: { slug: "game-room", name: "The Game Room", topic: "gaming", description: "Patch notes, backlogs, and arguments about difficulty settings.", norms: { prefers: ["humor"], dislikes: ["controversy"], summary: "Friendly, jokey, allergic to gatekeeping." } },
  speedrunning: { slug: "speedrun-hub", name: "Speedrun Hub", topic: "speedrunning", description: "Routes, records, and category rule debates.", norms: { prefers: ["evidence"], dislikes: ["snark"], summary: "Values proof and precision. Unverified claims get torn apart." } },
  streaming: { slug: "live-now", name: "Live Now", topic: "streaming", description: "Small and big streamers trading notes on growth and burnout.", norms: { prefers: ["earnest", "humor"], dislikes: ["snark"], summary: "Supportive. Self-promo tolerated, drama is not." } },
  indiedev: { slug: "indie-makers", name: "Indie Makers", topic: "indiedev", description: "Solo devs sharing honest numbers and devlogs.", norms: { prefers: ["evidence", "earnest"], dislikes: ["controversy"], summary: "Honest numbers beat hype. Humble posts do well." } },
  tech: { slug: "gadget-bench", name: "Gadget Bench", topic: "tech", description: "Device takes, update regrets, and spec sheet wars.", norms: { prefers: ["evidence"], dislikes: [], summary: "Spec-driven, skeptical of marketing." } },
  startups: { slug: "founder-floor", name: "Founder Floor", topic: "startups", description: "Building in public, pitch decks, and pivot stories.", norms: { prefers: ["evidence", "earnest"], dislikes: ["snark"], summary: "Rewards transparency and real metrics." } },
  ai: { slug: "model-watch", name: "Model Watch", topic: "ai", description: "Model drops, benchmarks, and AI product hot takes.", norms: { prefers: ["evidence", "controversy"], dislikes: [], summary: "Loves a spicy benchmark debate. Wants sources." } },
  programming: { slug: "stack-trace", name: "Stack Trace", topic: "programming", description: "Bugs, refactors, and code review confessions.", norms: { prefers: ["humor", "evidence"], dislikes: ["controversy"], summary: "Dry humor and war stories. Language wars get muted." } },
  music: { slug: "b-side", name: "B-Side", topic: "music", description: "Album talk, deep cuts, and tour diaries.", norms: { prefers: ["earnest"], dislikes: ["snark"], summary: "Passionate and personal. Snobbery is frowned upon." } },
  film: { slug: "screening-room", name: "Screening Room", topic: "film", description: "Finales, trailers, and rewatch takes.", norms: { prefers: ["controversy", "humor"], dislikes: [], summary: "Hot takes welcome, spoilers are not." } },
  celebs: { slug: "red-carpet", name: "Red Carpet Desk", topic: "celebs", description: "Pop culture moments and press tour lore.", norms: { prefers: ["humor", "controversy"], dislikes: [], summary: "Gossipy and fast. Drama travels quickly here." } },
  comedy: { slug: "open-mic", name: "Open Mic", topic: "comedy", description: "Bits, specials, and stories from the back of the room.", norms: { prefers: ["humor"], dislikes: ["earnest"], summary: "Be funny or be quiet." } },
  memes: { slug: "meme-vault", name: "Meme Vault", topic: "memes", description: "Formats, cursed images, and in-jokes.", norms: { prefers: ["humor"], dislikes: ["evidence"], summary: "Low effort, high reward. Explaining a joke is a crime." } },
  sports: { slug: "the-bleachers", name: "The Bleachers", topic: "sports", description: "Game day takes and trade deadline panic.", norms: { prefers: ["controversy", "humor"], dislikes: [], summary: "Loud, tribal, loyal." } },
  politics: { slug: "town-square", name: "Town Square", topic: "politics", description: "Local issues and policy, argued in good faith (mostly).", norms: { prefers: ["evidence", "earnest"], dislikes: ["snark"], summary: "Civility rules enforced. Sources expected." } },
  science: { slug: "lab-notes", name: "Lab Notes", topic: "science", description: "Papers, replications, and explainers.", norms: { prefers: ["evidence"], dislikes: ["controversy"], summary: "Cite or be ignored." } },
  art: { slug: "sketch-club", name: "Sketch Club", topic: "art", description: "Works in progress, critique, and artist support.", norms: { prefers: ["earnest"], dislikes: ["snark"], summary: "Kind critique only." } },
  books: { slug: "margin-notes", name: "Margin Notes", topic: "books", description: "Reading logs, book club picks, and series finales.", norms: { prefers: ["earnest"], dislikes: [], summary: "Cozy, thoughtful, long replies." } },
  food: { slug: "the-pantry", name: "The Pantry", topic: "food", description: "Recipes, fails, and hot sauce rankings.", norms: { prefers: ["humor", "earnest"], dislikes: [], summary: "Warm and chaotic." } },
  fitness: { slug: "rest-day", name: "Rest Day Club", topic: "fitness", description: "Runs, PRs, and admitting you skipped leg day.", norms: { prefers: ["earnest"], dislikes: ["snark"], summary: "Encouraging. Shaming gets you muted." } },
  everyday: { slug: "group-chat", name: "The Group Chat", topic: "everyday", description: "Small wins, Mondays, and life admin.", norms: { prefers: ["humor", "earnest"], dislikes: [], summary: "Relatable beats impressive." } },
  creator: { slug: "creator-circle", name: "Creator Circle", topic: "creator", description: "Sponsorships, algorithm changes, and creator drama.", norms: { prefers: ["controversy", "evidence"], dislikes: [], summary: "Drama travels fast. Receipts matter." } },
  internet: { slug: "lore-archive", name: "Lore Archive", topic: "internet", description: "Internet history, main characters, and forum lore.", norms: { prefers: ["humor"], dislikes: [], summary: "Ironic and very online." } },
  finance: { slug: "money-talk", name: "Money Talk", topic: "finance", description: "Budgets, rent, and salary transparency.", norms: { prefers: ["evidence", "earnest"], dislikes: ["snark"], summary: "Practical, numbers-first." } },
};
