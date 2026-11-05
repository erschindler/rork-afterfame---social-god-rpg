/**
 * Shared phrase macros. A `$name` in a bank line is replaced with the macro's
 * alternation before compiling, so common fillers vary everywhere for free.
 */
export const MACROS: Record<string, string> = {
  hon: "{honestly|ngl|not gonna lie|tbh|real talk|genuinely|no joke|for real}",
  yes: "{yeah|yes|yep|absolutely|100%|exactly|facts|correct}",
  no: "{nah|no|nope|hard disagree|absolutely not|respectfully, no|counterpoint: no}",
  lol: "{lol|lmao|haha|lmfao|hahaha}",
  people: "{people|folks|everyone|half this app|the timeline|my whole feed|the group chat}",
  bad: "{rough|brutal|a lot|not it|cursed|unwell|a crime}",
  good: "{so good|elite|incredible|unreal|perfect|a banger|top tier}",
  really: "{really|genuinely|actually|seriously|truly}",
  think: "{think|feel like|suspect|swear|bet}",
  wild: "{wild|insane|unhinged|deranged|unreal|chaotic|feral}",
  friend: "{my friend|a friend of mine|my roommate|my cousin|a coworker|my ex|my neighbor|my group chat}",
  when: "{last night|this morning|yesterday|last week|on tuesday|at 2am|a few years ago|over the weekend}",
  kinda: "{kinda|sort of|a little|lowkey|basically|borderline}",
  sorry: "{sorry|apologies|my bad}",
  ok: "{ok|okay|alright|fine|fair}",
  wait: "{wait|hold on|hang on|one sec|pause}",
  imo: "{imo|in my opinion|if you ask me|personally|from where I'm sitting}",
  sure: "{sure|of course|obviously|naturally|clearly}",
  dead: "{I'm dead|I'm crying|I can't|screaming|deceased|sending me}",
  agree: "{agreed|same|real|true|valid|so true|accurate}",
  lowk: "{lowkey|highkey|quietly|secretly|openly}",
  thanks: "{thanks|thank you|ty|appreciate it|appreciate you}",
  fr: "{fr|for real|no cap|seriously}",
};

export function applyMacros(line: string): string {
  return line.replace(/\$([a-z]+)/g, (m, k: string) => MACROS[k] ?? m);
}
