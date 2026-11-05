/**
 * Trigger detection: one pass over a message produces the set of trigger
 * families it contains (question type, mood, subject, register). The bank
 * indexes entries by trigger, so lookups only score entries that can match.
 */

export type Trigger =
  | "q_why" | "q_how" | "q_what" | "q_recs" | "q_opinion" | "q_yesno" | "q_origin" | "q_wyd" | "question"
  | "money" | "work" | "tired" | "sad" | "win" | "fail" | "hot_take" | "complaint" | "food" | "weather" | "ai"
  | "drama" | "gaming" | "music" | "sports" | "tech" | "relationship" | "pets" | "self_promo" | "feedback_ask"
  | "first_post" | "birthday" | "gratitude" | "announcement" | "nostalgia" | "health" | "travel" | "school"
  | "politics" | "conspiracy" | "apology" | "hostile" | "compliment" | "caps" | "gm" | "gn" | "weekend" | "link"
  | "numbers" | "long" | "short" | "laugh" | "greeting" | "agreeing" | "disagreeing" | "collab" | "advice";

const RULES: [Trigger, RegExp][] = [
  ["q_why", /\bwhy\b[^.!]*\?|^why\b/],
  ["q_how", /\bhow (do|did|does|can|should|would|to|are|is)\b|\bhow'?d\b/],
  ["q_what", /\bwhat('?s| is| are| was| were| do| did| should)\b[^.!]*\?/],
  ["q_recs", /\b(recommend|recs?\b|suggestions?|where (do|should) i start|any good|best (way|place|one))\b/],
  ["q_opinion", /\b(thoughts\??|what do you think|your take|opinion on|do you agree|am i wrong|wdyt)\b/],
  ["q_yesno", /^(is|are|do|does|did|can|could|should|would|will|have|has|was|were|ever)\b[^.!]*\?/],
  ["q_origin", /\b(got you into|get into|got into|how did you start|how'?d you start|where did you start|first got|why did you start|what made you)\b/],
  ["q_wyd", /\b(wyd|what are you (working on|up to|doing)|what('?s| is) new|working on lately|up to lately|this week)\b/],
  ["money", /(\$\d|\b\d+k\b|\b(price|prices|expensive|cheap|paid|salary|rent|money|afford|bucks|cost|budget|broke|sponsor|invoice)\b)/],
  ["work", /\b(job|boss|office|meeting|meetings|coworker|manager|fired|promotion|interview|hiring|layoffs?|9 ?to ?5|standup)\b/],
  ["tired", /\b(tired|exhausted|burn(ed|t)? ?out|no sleep|insomnia|3 ?am|can'?t sleep|sleepy|running on)\b/],
  ["sad", /\b(sad|depress\w*|lonely|cried|crying|rough (day|week)|hard time|grief|heartbroken|miss (him|her|them|it)|not okay)\b/],
  ["win", /\b(finally|shipped|launched|hit \d|milestone|got the job|promoted|passed|we did it|proud|new pb|record|won)\b/],
  ["fail", /\b(failed|rejected|lost|messed up|broke|crashed|bombed|flopped|ruined|disaster)\b/],
  ["hot_take", /\b(hot take|unpopular opinion|controversial|i'?ll say it|fight me|hear me out|nobody wants to hear)\b/],
  ["complaint", /\b(i hate|so annoying|can'?t stand|the worst|ugh|sick of|tired of|why does every)\b/],
  ["food", /\b(pizza|coffee|food|cook\w*|ate|eat|eating|dinner|lunch|breakfast|snacks?|recipe|ramen|tacos?|burger|soup)\b/],
  ["weather", /\b(rain\w*|snow\w*|heatwave|weather|freezing|sunny|humid|storm)\b/],
  ["ai", /\b(ai|chatgpt|llms?|gpt|prompt\w*|robots?|machine learning|neural)\b/],
  ["drama", /\b(drama|beef|cancel\w*|exposed|callout|receipts|tea|discourse|ratio\w*)\b/],
  ["gaming", /\b(patch|nerf\w*|buff\w*|speedrun\w*|boss|ranked|fps|controller|console|meta|steam|level|quest)\b/],
  ["music", /\b(album|song|track|playlist|concert|tour|mixtape|vinyl|beat|verse|chorus)\b/],
  ["sports", /\b(match|referee|ref|season|playoffs?|goal|scored?|trade|league|coach|stadium)\b/],
  ["tech", /\b(bug|deploy\w*|code|coding|server|app|startup|beta|release|repo|framework|typescript|api)\b/],
  ["relationship", /\b(date|dating|my ex|crush|partner|boyfriend|girlfriend|breakup|wedding|situationship)\b/],
  ["pets", /\b(dog|cat|puppy|kitten|pet|doggo|hamster|parrot)\b/],
  ["self_promo", /\b(link in bio|check out my|new video|my channel|subscribe|out now|my newsletter|preorder)\b/],
  ["feedback_ask", /\b(feedback|roast my|rate my|be honest|honest opinion|critique)\b/],
  ["first_post", /\b(first post|hello world|new here|just joined|my first)\b/],
  ["birthday", /\b(birthday|bday|turning \d+)\b/],
  ["gratitude", /\b(thank you|thanks|grateful|appreciate)\b/],
  ["announcement", /\b(big news|announcing|excited to share|today i|starting today|it'?s official)\b/],
  ["nostalgia", /\b(remember when|back in|used to|nostalgi\w*|childhood|the old days|in 20\d\d)\b/],
  ["health", /\b(gym|workout|ran|running|diet|sick|doctor|therapy|steps|stretch\w*)\b/],
  ["travel", /\b(flight|airport|trip|travel\w*|vacation|hotel|passport|layover)\b/],
  ["school", /\b(class|exam|homework|professor|college|school|semester|thesis|finals)\b/],
  ["politics", /\b(election|policy|government|senator|congress|parliament|vote|voting)\b/],
  ["conspiracy", /\b(wake up|they don'?t want you|sheeple|do your (own )?research|psyop|cover ?up)\b/],
  ["apology", /\b(sorry|apologi[sz]e|my bad|i was wrong|out of line)\b/],
  ["hostile", /\b(idiot|stupid|trash|clown|loser|pathetic|shut up|fraud|grifter|moron|cringe)\b/],
  ["compliment", /\b(love (this|your|you)|so good|amazing|incredible|genius|beautiful|big fan|huge fan|inspir\w*|you'?re great|goat)\b/],
  ["gm", /^(gm|good morning|morning all|mornin)\b/],
  ["gn", /^(gn|good night|night all|nighty)\b/],
  ["weekend", /\b(weekend|friday|monday|saturday|sunday)\b/],
  ["link", /https?:\/\//],
  ["numbers", /\b\d+(\.\d+)?\s?(%|percent|followers|people|hours|days|years|views|k)\b/],
  ["laugh", /^(lol|lmao|haha|hah|lmfao|ahaha|dead|💀|😭|😂)/],
  ["greeting", /^(hey|hi|hello|yo|sup|hiya|heya|howdy|hii+)\b/],
  ["agreeing", /^(yes|yeah|yep|exactly|true|agreed|facts|real|same|right)\b/],
  ["disagreeing", /^(no|nah|nope|wrong|disagree|not really|i don'?t think)\b/],
  ["collab", /\b(collab|work together|team up|podcast|feature|stream together|guest)\b/],
  ["advice", /\b(advice|tips?|how do (you|i)|any recs|what should i)\b/],
];

/** Detect every trigger in one message. Order of the result is stable. */
export function detectTriggers(text: string): Set<Trigger> {
  const t = text.toLowerCase().trim();
  const out = new Set<Trigger>();
  for (const [name, re] of RULES) if (re.test(t)) out.add(name);
  if (t.includes("?")) out.add("question");
  if (/[A-Z]{4,}/.test(text) || /!{2,}/.test(text)) out.add("caps");
  if (t.length > 200) out.add("long");
  if (t.length > 0 && t.length < 28) out.add("short");
  // A question about origins is not also a generic why/how for selection purposes.
  if (out.has("q_origin")) {
    out.delete("q_why");
    out.delete("q_how");
  }
  return out;
}

export const ALL_TRIGGERS: Trigger[] = [...RULES.map((r) => r[0]), "question", "caps", "long", "short"];

/** Most specific question type, or null. */
export function questionKind(tr: Set<Trigger>): "origin" | "wyd" | "recs" | "opinion" | "why" | "how" | "yesno" | "what" | "generic" | null {
  if (tr.has("q_origin")) return "origin";
  if (tr.has("q_wyd")) return "wyd";
  if (tr.has("q_recs")) return "recs";
  if (tr.has("q_opinion")) return "opinion";
  if (tr.has("q_why")) return "why";
  if (tr.has("q_how")) return "how";
  if (tr.has("q_yesno")) return "yesno";
  if (tr.has("q_what")) return "what";
  if (tr.has("question")) return "generic";
  return null;
}
