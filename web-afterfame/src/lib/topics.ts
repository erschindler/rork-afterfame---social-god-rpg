export const TOPICS: { id: string; name: string }[] = [
  { id: "gaming", name: "Gaming" },
  { id: "speedrunning", name: "Speedrunning" },
  { id: "streaming", name: "Streaming" },
  { id: "indiedev", name: "Indie Dev" },
  { id: "tech", name: "Technology" },
  { id: "startups", name: "Startups" },
  { id: "ai", name: "AI" },
  { id: "programming", name: "Programming" },
  { id: "music", name: "Music" },
  { id: "film", name: "Film & TV" },
  { id: "celebs", name: "Pop Culture" },
  { id: "comedy", name: "Comedy" },
  { id: "memes", name: "Memes" },
  { id: "sports", name: "Sports" },
  { id: "politics", name: "Public Affairs" },
  { id: "science", name: "Science" },
  { id: "art", name: "Art & Design" },
  { id: "books", name: "Books" },
  { id: "food", name: "Food" },
  { id: "fitness", name: "Fitness" },
  { id: "everyday", name: "Everyday Life" },
  { id: "creator", name: "Creator Economy" },
  { id: "internet", name: "Internet Culture" },
  { id: "finance", name: "Money" },
];

export const topicName = (id: string | null | undefined): string => TOPICS.find((t) => t.id === id)?.name ?? "General";

export const THEMES: { id: string; name: string; blurb: string; topics: string[] }[] = [
  { id: "mixed", name: "Mixed Internet", blurb: "A bit of everything. The default chaos.", topics: ["gaming", "tech", "music", "memes", "politics", "creator"] },
  { id: "mainstream", name: "Mainstream", blurb: "Everyday life, pop culture, sports, food.", topics: ["everyday", "celebs", "sports", "food"] },
  { id: "gaming", name: "Gaming & Streaming", blurb: "Patch notes, speedruns, streamers, indie devs.", topics: ["gaming", "speedrunning", "streaming", "indiedev"] },
  { id: "tech", name: "Tech & Startups", blurb: "Founders, engineers, AI hype and skeptics.", topics: ["tech", "startups", "ai", "programming"] },
  { id: "entertainment", name: "Entertainment", blurb: "Film, music, comedy, celebrity orbit.", topics: ["film", "music", "comedy", "celebs"] },
  { id: "politics", name: "Public Affairs", blurb: "Policy, science, local politics, money.", topics: ["politics", "science", "finance"] },
  { id: "creator", name: "Creator Economy", blurb: "Sponsorships, algorithms, collabs, drama.", topics: ["creator", "streaming", "art"] },
  { id: "underground", name: "Underground", blurb: "Niche forums, lore, art, ironic posting.", topics: ["internet", "memes", "art", "programming"] },
];
