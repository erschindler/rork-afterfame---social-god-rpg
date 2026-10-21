/** Pure generator for the fictional population of a world. */
import { clamp, Rng } from "./rng.ts";
import { THEME_TOPICS, type WorldTheme } from "./config.ts";

export type Archetype =
  | "casual" | "memer" | "small_creator" | "established_creator" | "expert" | "journalist"
  | "critic" | "fan" | "troll" | "moderator" | "entrepreneur" | "artist" | "gamer" | "hobbyist"
  | "activist" | "opportunist" | "provocateur" | "celebrity" | "anon" | "community_leader" | "brand";

export type CommStyle = "casual" | "terse" | "snarky" | "earnest" | "academic" | "hype" | "deadpan" | "formal";
export type HumorStyle = "dry" | "absurd" | "wholesome" | "sarcastic" | "none" | "punny";

export interface Traits {
  warmth: number;
  aggression: number;
  rigor: number;
  humor: number;
  ambition: number;
  sociability: number;
  conflict_tolerance: number;
  risk_tolerance: number;
  loyalty: number;
  openness: number;
  contrarian: number;
}

export interface ActivityProfile {
  postsPerDay: number;
  peakHour: number;
  window: number;
}

export interface GeneratedAccount {
  seq: number;
  username: string;
  display_name: string;
  bio: string;
  avatar_reference: string;
  archetype: Archetype;
  personality_traits: Traits;
  interests: string[];
  expertise: string[];
  communication_style: CommStyle;
  humor_style: HumorStyle;
  current_goals: string[];
  fame: number;
  admiration: number;
  infamy: number;
  credibility: number;
  influence: number;
  controversy: number;
  audience_loyalty: number;
  follower_count_cache: number;
  following_count_cache: number;
  activity_profile: ActivityProfile;
  account_age_days: number;
}

interface ArchetypeDef {
  weight: number;
  fame: [number, number];
  styles: CommStyle[];
  humor: HumorStyle[];
  traits: Partial<Record<keyof Traits, [number, number]>>;
  goals: string[];
  postsPerDay: [number, number];
  bios: string[];
}

const ARCHETYPES: Record<Archetype, ArchetypeDef> = {
  casual: {
    weight: 22, fame: [0, 8], styles: ["casual", "terse", "earnest"], humor: ["wholesome", "dry", "none"],
    traits: { aggression: [0, 0.3], sociability: [0.2, 0.7] }, postsPerDay: [0.3, 2],
    goals: ["pursue a personal interest", "keep up with friends"],
    bios: ["just here for the {t1} discourse", "{t1}, {t2}, and too much coffee", "lurker turned poster", "opinions are mine and also probably wrong"],
  },
  memer: {
    weight: 8, fame: [3, 30], styles: ["terse", "deadpan", "snarky"], humor: ["absurd", "sarcastic"],
    traits: { humor: [0.75, 1], rigor: [0, 0.3] }, postsPerDay: [3, 9],
    goals: ["grow their own audience", "start a meme that sticks"],
    bios: ["posting through it", "{t1} memes, no context", "i make the jokes you screenshot", "certified shitposter (affectionate)"],
  },
  small_creator: {
    weight: 9, fame: [8, 28], styles: ["earnest", "casual", "hype"], humor: ["wholesome", "punny", "dry"],
    traits: { ambition: [0.55, 0.95], sociability: [0.5, 0.9] }, postsPerDay: [2, 6],
    goals: ["grow their own audience", "land a first collaboration", "promote a project"],
    bios: ["making {t1} videos for the 40 people who care", "{t1} creator | building in public", "small channel, big plans", "new {t1} content every week"],
  },
  established_creator: {
    weight: 3, fame: [45, 75], styles: ["casual", "hype", "earnest"], humor: ["dry", "wholesome", "sarcastic"],
    traits: { ambition: [0.6, 1], sociability: [0.5, 0.9] }, postsPerDay: [2, 5],
    goals: ["maintain credibility", "protect their audience", "scout rising creators"],
    bios: ["{t1} creator. 8 years and still learning", "full-time {t1}. business inquiries in the usual place", "making the {t1} content I wanted as a kid"],
  },
  expert: {
    weight: 6, fame: [12, 45], styles: ["academic", "formal", "earnest"], humor: ["dry", "none"],
    traits: { rigor: [0.75, 1], aggression: [0, 0.3], warmth: [0.3, 0.7] }, postsPerDay: [0.8, 3],
    goals: ["maintain credibility", "correct misinformation", "become known in a niche"],
    bios: ["researcher, {t1}. citations available on request", "{t1} for 15 years. I try to be precise", "I explain {t1} so you don't have to", "principal {t1} engineer, views my own"],
  },
  journalist: {
    weight: 4, fame: [18, 50], styles: ["formal", "terse", "earnest"], humor: ["dry", "none"],
    traits: { rigor: [0.6, 0.95], sociability: [0.4, 0.8] }, postsPerDay: [2, 6],
    goals: ["break a story", "maintain credibility", "cover a major world event"],
    bios: ["covering {t1} and the people who shape it", "reporter, {t1} beat. tips open", "newsletter about {t1}. I read the fine print"],
  },
  critic: {
    weight: 4, fame: [10, 40], styles: ["snarky", "academic", "deadpan"], humor: ["sarcastic", "dry"],
    traits: { contrarian: [0.55, 0.95], aggression: [0.3, 0.65], rigor: [0.4, 0.8] }, postsPerDay: [1.5, 5],
    goals: ["win an ongoing argument", "become known in a niche"],
    bios: ["{t1} criticism, mostly disappointed", "someone has to say it", "reviewing {t1} so you don't waste a weekend"],
  },
  fan: {
    weight: 8, fame: [0, 12], styles: ["hype", "casual", "earnest"], humor: ["wholesome", "absurd"],
    traits: { loyalty: [0.65, 1], warmth: [0.55, 1] }, postsPerDay: [2, 7],
    goals: ["support favorite creators", "find their people"],
    bios: ["{t1} enjoyer (derogatory)", "here for my faves", "{t1} brainrot since forever", "will defend my faves with my life"],
  },
  troll: {
    weight: 3, fame: [0, 18], styles: ["snarky", "terse"], humor: ["sarcastic", "absurd"],
    traits: { aggression: [0.65, 1], warmth: [0, 0.25], conflict_tolerance: [0.8, 1], contrarian: [0.6, 1] }, postsPerDay: [3, 8],
    goals: ["get a reaction", "win an ongoing rivalry"],
    bios: ["you're wrong and I can prove it (I can't)", "ratio enthusiast", "devil's advocate, unpaid"],
  },
  moderator: {
    weight: 3, fame: [5, 25], styles: ["formal", "earnest", "casual"], humor: ["wholesome", "dry"],
    traits: { warmth: [0.5, 0.9], aggression: [0, 0.2], rigor: [0.5, 0.8] }, postsPerDay: [1, 4],
    goals: ["build a community", "keep discussions civil"],
    bios: ["mod of the {t1} corner. be nice", "community stuff, {t1}. rules are pinned", "I keep the {t1} threads from catching fire"],
  },
  entrepreneur: {
    weight: 5, fame: [6, 40], styles: ["hype", "formal", "earnest"], humor: ["none", "dry"],
    traits: { ambition: [0.75, 1], risk_tolerance: [0.6, 1] }, postsPerDay: [2, 6],
    goals: ["promote a project", "establish a professional relationship", "grow their own audience"],
    bios: ["founder @ something {t1}. building fast", "2x founder, 1x exit, 0x sleep", "shipping {t1} tools. dms open for builders"],
  },
  artist: {
    weight: 5, fame: [3, 35], styles: ["earnest", "casual", "deadpan"], humor: ["absurd", "wholesome", "dry"],
    traits: { openness: [0.6, 1], warmth: [0.4, 0.85] }, postsPerDay: [1, 4],
    goals: ["get recognition for their work", "pursue a personal interest"],
    bios: ["I draw things. sometimes {t1} things", "illustrator | {t1} | commissions closed", "making art about {t1} and feelings"],
  },
  gamer: {
    weight: 6, fame: [0, 20], styles: ["casual", "terse", "hype"], humor: ["absurd", "sarcastic"],
    traits: { sociability: [0.4, 0.85] }, postsPerDay: [2, 6],
    goals: ["pursue a personal interest", "find a team"],
    bios: ["{t1} till sunrise", "hardstuck but optimistic", "backlog: 200 games. finished: 3"],
  },
  hobbyist: {
    weight: 6, fame: [0, 12], styles: ["earnest", "casual", "academic"], humor: ["wholesome", "punny"],
    traits: { warmth: [0.5, 0.9], rigor: [0.3, 0.7] }, postsPerDay: [0.5, 3],
    goals: ["pursue a personal interest", "share what they learned"],
    bios: ["weekend {t1} nerd", "learning {t1} one mistake at a time", "{t1} and {t2} hobbyist"],
  },
  activist: {
    weight: 3, fame: [8, 35], styles: ["earnest", "formal", "snarky"], humor: ["none", "sarcastic"],
    traits: { conflict_tolerance: [0.6, 1], rigor: [0.4, 0.8], warmth: [0.4, 0.8] }, postsPerDay: [3, 7],
    goals: ["change a conversation", "build a community"],
    bios: ["organizing around {t1}. we can do better", "loud about {t1} because someone has to be"],
  },
  opportunist: {
    weight: 3, fame: [5, 30], styles: ["hype", "casual"], humor: ["sarcastic", "none"],
    traits: { ambition: [0.8, 1], loyalty: [0, 0.35], risk_tolerance: [0.6, 1] }, postsPerDay: [3, 8],
    goals: ["ride the next trend", "grow their own audience"],
    bios: ["{t1} | {t2} | whatever is trending tbh", "growth hacker. dm for collabs"],
  },
  provocateur: {
    weight: 2, fame: [25, 60], styles: ["snarky", "hype"], humor: ["sarcastic"],
    traits: { conflict_tolerance: [0.85, 1], aggression: [0.5, 0.85], contrarian: [0.7, 1], risk_tolerance: [0.7, 1] }, postsPerDay: [4, 9],
    goals: ["amplify conflict", "win an ongoing rivalry", "stay relevant"],
    bios: ["saying what you're thinking about {t1}", "the {t1} takes they don't want you to read", "banned from 3 group chats"],
  },
  celebrity: {
    weight: 1, fame: [70, 92], styles: ["casual", "hype", "terse"], humor: ["wholesome", "dry"],
    traits: { ambition: [0.5, 0.9], sociability: [0.3, 0.7] }, postsPerDay: [0.5, 2],
    goals: ["promote a project", "avoid controversy"],
    bios: ["{t1}. new thing out soon", "official account", "it's me. hi."],
  },
  anon: {
    weight: 4, fame: [0, 30], styles: ["deadpan", "terse", "snarky"], humor: ["absurd", "dry"],
    traits: { risk_tolerance: [0.5, 1], openness: [0.4, 0.9] }, postsPerDay: [2, 7],
    goals: ["stay mysterious", "pursue a personal interest"],
    bios: ["", "no", "anon. {t1}.", "a voice in the {t1} void"],
  },
  community_leader: {
    weight: 2, fame: [20, 50], styles: ["earnest", "casual", "formal"], humor: ["wholesome", "dry"],
    traits: { warmth: [0.6, 1], sociability: [0.7, 1], loyalty: [0.6, 1] }, postsPerDay: [2, 5],
    goals: ["build a community", "mentor newcomers", "keep discussions civil"],
    bios: ["running the {t1} meetup since forever", "{t1} community organizer. say hi", "I connect {t1} people with other {t1} people"],
  },
  brand: {
    weight: 2, fame: [20, 55], styles: ["hype", "formal"], humor: ["punny", "wholesome"],
    traits: { risk_tolerance: [0, 0.3], aggression: [0, 0.15] }, postsPerDay: [1, 4],
    goals: ["promote a project", "avoid controversy"],
    bios: ["the official {t1} account. we read replies", "making {t1} a little better. support in DMs"],
  },
};

const FIRST = [
  "Mara", "Dex", "Priya", "Gilbert", "Kai", "Luna", "Ravi", "Tom", "Ines", "Jonah", "Amara", "Theo", "Sana", "Felix",
  "Nadia", "Omar", "Hana", "Leo", "Zara", "Mateo", "Yuki", "Bea", "Kofi", "Iris", "Malik", "Elif", "Noor", "Caleb",
  "Rosa", "Arjun", "Wren", "Tariq", "Lena", "Ezra", "Chloe", "Bashir", "Mina", "Silas", "Ada", "Jules", "Femi",
  "Greta", "Hugo", "Ifeoma", "Juno", "Kenji", "Lucia", "Milo", "Nia", "Oskar", "Pia", "Quinn", "Remy", "Sol", "Tess",
  "Uma", "Vik", "Wes", "Xiomara", "Yara", "Zeke", "Ana", "Ben", "Cyrus", "Dana", "Eli", "Fatima", "Gus", "Hollis",
  "Ike", "Jada", "Kit", "Lior", "Moss", "Nell", "Otis", "Paz", "Reid", "Saoirse", "Tobi", "Vera",
];
const LAST = [
  "Okonkwo", "Hollow", "Nandakumar", "Vance", "Torres", "Park", "Mehta", "Writes", "Alvarez", "Brandt", "Chen",
  "Diallo", "Eriksen", "Fontaine", "Garcia", "Haddad", "Ito", "Jovanovic", "Kowalski", "Lindqvist", "Moreau",
  "Nakamura", "Oduya", "Petrov", "Quaid", "Rahman", "Silva", "Tanaka", "Umar", "Varga", "Whitlock", "Xu",
  "Yilmaz", "Zamora", "Abara", "Bishop", "Castillo", "Duarte", "Ellery", "Farouk", "Grieve", "Hartley", "Ibarra",
  "Jansen", "Kaur", "Laine", "Mbeki", "Novak", "Osei", "Pike", "Reyes", "Sato", "Thorne", "Underhill", "Voss", "Wilde",
];
const HANDLE_TAILS = ["builds", "plays", "writes", "inchips", "makes", "codes", "irl", "hq", "draws", "talks", "fm", "zone", "lab", "daily", "speaks", "files", "notes", "runs", "cooks", "loops"];
const BRAND_NAMES = ["Pixelforge", "Northwind Audio", "Loopline", "Cobalt Labs", "Brightfeed", "Tidewater Games", "Paperkite", "Moonbase Coffee", "Arcwell", "Fernway"];
const ANON_NAMES = ["static", "quiet observer", "the archivist", "404", "nightshift", "small fern", "liminal", "a pigeon", "moth", "unlisted"];

const pickRange = (rng: Rng, [a, b]: [number, number]) => rng.range(a, b);

function makeTraits(rng: Rng, def: ArchetypeDef): Traits {
  const base = (): number => clamp(rng.gaussian(0.5, 0.18), 0, 1);
  const t: Traits = {
    warmth: base(), aggression: clamp(rng.gaussian(0.3, 0.18), 0, 1), rigor: base(), humor: base(),
    ambition: base(), sociability: base(), conflict_tolerance: base(), risk_tolerance: base(),
    loyalty: base(), openness: base(), contrarian: clamp(rng.gaussian(0.35, 0.2), 0, 1),
  };
  for (const [k, r] of Object.entries(def.traits) as [keyof Traits, [number, number]][]) {
    t[k] = pickRange(rng, r);
  }
  for (const k of Object.keys(t) as (keyof Traits)[]) t[k] = Math.round(t[k] * 100) / 100;
  return t;
}

function fillBio(template: string, t1: string, t2: string): string {
  const nice = (s: string) => s.replace("indiedev", "indie dev").replace("celebs", "pop culture").replace("ai", "AI");
  return template.replace("{t1}", nice(t1)).replace("{t2}", nice(t2));
}

/** Fame (0-100) to an abstract audience size; most of it lives outside the simulated population. */
export function audienceFromFame(fame: number, rng: Rng): number {
  return Math.max(3, Math.round(Math.exp(fame / 9.5) * rng.range(6, 14)));
}

/** Generate `count` distinct accounts for a theme. Deterministic for a given seed. */
export function generatePopulation(seed: number, theme: WorldTheme, count: number): GeneratedAccount[] {
  const rng = new Rng(seed);
  const topics = THEME_TOPICS[theme];
  const archetypes = Object.keys(ARCHETYPES) as Archetype[];
  const usedHandles = new Set<string>();
  const out: GeneratedAccount[] = [];

  for (let i = 0; i < count; i++) {
    const r = rng.fork(i);
    const archetype = r.weighted(archetypes, (a) => ARCHETYPES[a].weight);
    const def = ARCHETYPES[archetype];
    const interests = r.sample(topics, r.int(2, 3));
    if (r.chance(0.25)) {
      const extra = r.pick(["everyday", "memes", "music", "food", "film"]);
      if (!interests.includes(extra)) interests.push(extra);
    }
    const expertise = archetype === "expert" || archetype === "journalist" || archetype === "established_creator"
      ? [interests[0]]
      : r.chance(0.15) ? [interests[0]] : [];

    const first = r.pick(FIRST);
    const last = r.pick(LAST);
    let display = `${first} ${last}`;
    if (archetype === "brand") display = r.pick(BRAND_NAMES);
    if (archetype === "anon") display = r.pick(ANON_NAMES);

    let handle = "";
    for (let attempt = 0; attempt < 12; attempt++) {
      const variant = attempt < 4 ? r.int(0, 5) : 6;
      const base = (() => {
        switch (variant) {
          case 0: return `${first}${last}`;
          case 1: return `${first}${r.pick(HANDLE_TAILS)}`;
          case 2: return `${first[0]}${last}`;
          case 3: return `${first}_${interests[0]}`;
          case 4: return archetype === "brand" ? display.replace(/\s/g, "") : `${last}${r.pick(HANDLE_TAILS)}`;
          case 5: return archetype === "anon" ? `${display.replace(/\s/g, "")}${r.int(1, 99)}` : `${first}${last[0]}`;
          default: return `${first}${last}${r.int(10, 999)}`;
        }
      })();
      handle = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
      if (handle.length >= 3 && !usedHandles.has(handle)) break;
    }
    if (usedHandles.has(handle) || handle.length < 3) handle = `user${seed % 1000}${i}`;
    usedHandles.add(handle);

    const fameRaw = pickRange(r, def.fame);
    const fame = Math.round(clamp(fameRaw * r.range(0.8, 1.15), 0, 95) * 10) / 10;
    const traits = makeTraits(r, def);
    const credibility = Math.round(clamp(40 + traits.rigor * 35 - traits.aggression * 15 + r.gaussian(0, 6), 5, 95));
    const infamy = Math.round(clamp(traits.aggression * 25 + (archetype === "provocateur" || archetype === "troll" ? 20 : 0) + r.gaussian(0, 4), 0, 80));
    const admiration = Math.round(clamp(45 + traits.warmth * 30 - infamy * 0.4 + r.gaussian(0, 6), 5, 95));
    const controversy = Math.round(clamp(traits.conflict_tolerance * 20 + infamy * 0.5 + r.gaussian(0, 4), 0, 85));
    const influence = Math.round(clamp(fame * 0.6 + credibility * 0.2 - 10 + r.gaussian(0, 4), 0, 95));
    const followers = audienceFromFame(fame, r);

    out.push({
      seq: i,
      username: handle,
      display_name: display,
      bio: fillBio(r.pick(def.bios), interests[0], interests[1] ?? interests[0]),
      avatar_reference: `${handle}-${seed % 9973}`,
      archetype,
      personality_traits: traits,
      interests,
      expertise,
      communication_style: r.pick(def.styles),
      humor_style: r.pick(def.humor),
      current_goals: r.sample(def.goals, r.int(1, Math.min(2, def.goals.length))),
      fame,
      admiration,
      infamy,
      credibility,
      influence,
      controversy,
      audience_loyalty: Math.round(clamp(40 + traits.loyalty * 30 + r.gaussian(0, 8), 5, 95)),
      follower_count_cache: followers,
      following_count_cache: r.int(20, 600),
      activity_profile: {
        postsPerDay: Math.round(pickRange(r, def.postsPerDay) * 10) / 10,
        peakHour: r.int(0, 23),
        window: r.int(6, 14),
      },
      account_age_days: r.int(30, 3000),
    });
  }
  return out;
}

export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  casual: "Casual user", memer: "Memer", small_creator: "Small creator", established_creator: "Established creator",
  expert: "Expert", journalist: "Journalist", critic: "Critic", fan: "Fan", troll: "Troll", moderator: "Moderator",
  entrepreneur: "Entrepreneur", artist: "Artist", gamer: "Gamer", hobbyist: "Hobbyist", activist: "Activist",
  opportunist: "Opportunist", provocateur: "Provocateur", celebrity: "Public figure", anon: "Anonymous",
  community_leader: "Community leader", brand: "Brand",
};
