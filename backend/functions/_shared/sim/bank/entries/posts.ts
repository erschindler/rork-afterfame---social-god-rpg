/**
 * Original-post bank for SIM accounts. Slots come from the topic vocabulary
 * (<thing>, <noun>, <take>, <news>, <tag>) plus general flavor slots.
 */
export const POSTS: Record<string, string[]> = {
  post_observation: [
    "{nobody talks about how|funny how|wild that} {<noun> went from niche to everywhere|every <topic> conversation ends up about <noun>|<thing> quietly became the default}",
    "{every|literally every} <topic> {thread|argument|discourse cycle} {eventually becomes about <noun>|is just <thing> with extra steps}",
    "{the <topic> timeline today is|today in <topic>:} {50% <noun>, 50% people mad about <noun>|one good post and <num> quote-tweets about it}",
    "{noticing|starting to notice} {more people|everyone} {suddenly caring about <thing>|quietly giving up on <noun>}. {where were you in <year>|interesting}",
    "{small thing but|tiny observation:} {<thing> has gotten so much better|<noun> are back and nobody's admitting it}",
    "{you can tell|you can always tell} {who's actually done <thing>|who learned <topic> from a thread} {by how they talk about <noun>|in about two sentences}",
    "{the gap between|the difference between} {people who talk about <noun>|<topic> online} and {people who do it|<topic> irl} {is enormous|is a canyon}",
  ],
  post_hot_take: [
    "{hot take|unpopular opinion|I'll say it}: <take>",
    "{gonna get ratioed for this but|nobody wants to hear this but} <take>",
    "<take_cap>. {that's the post|fight me|I'll wait}",
    "{controversial but|hear me out:} {<thing> is overrated|<noun> are fine actually|<take>}",
    "{say it with me|repeat after me}: <take>",
    "{this is going to make people mad|the replies will be fun}: {<thing> peaked in <year>|<take>}",
  ],
  post_question: [
    "{genuine question|serious question|ok real question}: {is <thing> worth it in <year>?|why does everyone love <noun>?|what's the most overrated thing in <topic>?}",
    "{what got you into <topic>?|how did everyone here get into <topic>?} {mine was <thing>|asking for a thread}",
    "{be honest|okay be honest}: {have you ever actually finished <thing>?|how much have you spent on <noun>?}",
    "{if you could only keep one:|pick one:} <thing> or <thing2>? {wrong answers only|go}",
    "{what's a <topic> opinion you'd defend to the death?|what's your most controversial <topic> take?}",
    "{recommend me|need recs:} {something like <thing>|the best <noun> right now}. {go|please}",
  ],
  post_joke: [
    "{me|me, every day}: {I'm going to be normal about <thing>|I'll just do one more <thing>}. {also me|me three hours later}: {*is not normal about <thing>*|*it is 4am*}",
    "{nobody:|absolutely nobody:} {<topic> people|me}: {have you heard about <noun>|let me tell you about <thing>}",
    "{<thing> is just|turns out <thing> is} {<noun> with a marketing budget|a personality test I keep failing}",
    "{my therapist|my landlord|my mom}: {and what do you do for fun?|what's <topic>?} {me|me, sweating}: {<thing>|so it's complicated}",
    "{instructions unclear|update}: {accidentally became a <topic> person|now I own <num> <noun>}",
    "{five stages of <thing>|stages of <topic> grief}: denial, anger, <noun>, {more <noun>|buying <thing>}, acceptance",
    "{adding|putting} \"{survived|expert in} <thing>\" {to my resume|on my linkedin}",
  ],
  post_personal: [
    "{spent|wasted|lost} {the whole weekend|<num> hours|my entire evening} on <thing>. {zero regrets|some regrets|would do it again}",
    "{finally|after <num> months I finally} {tried|finished|figured out} <thing>. {it was worth it|it was not worth it|I'm changed}",
    "{small win today:|today's tiny victory:} {<thing> actually worked|got through <thing> without breaking anything}",
    "{rough week|long week}. {<thing> is the only thing keeping me going|back to <noun> tomorrow}",
    "{been thinking about|can't stop thinking about} {why I got into <topic>|<thing>} {lately|all week}. {it was <noun>, mostly|good times}",
    "{confession:|update:} {I still haven't finished <thing>|<thing> is my comfort <topic> thing and I won't apologize}",
  ],
  post_advice: [
    "{if you're starting with <topic>|beginner tip}: {skip <noun>, start with <thing>|<take>}",
    "{the best <topic> advice I ever got|advice I wish I had in <year>}: {<take>|do <thing> before you think you're ready}",
    "{stop|please stop} {buying <noun>|chasing <noun>} {and just do <thing>|before you've tried <thing>}",
    "{three things that actually helped me with <topic>|what actually worked}: <thing>, <thing2>, {and patience|and sleep}",
    "{you don't need|nobody needs} {expensive <noun>|<noun>} {to get good at <topic>|to start}. {<thing> is enough|seriously}",
  ],
  post_milestone: [
    "{finally hit|just hit} {<num>k followers|a new personal best|<num> days in a row} {after <num> months of <thing>|thanks to everyone who stuck around}",
    "{shipped|finished|launched} {<thing>|my <thing> project} {after <num> months|today}. {feels unreal|still processing}",
    "{one year of|<num> months of} {posting about <topic>|doing <thing>}. {thank you all|wild ride}",
    "{did it|we did it}: {<thing>|first place in <noun>}. {couldn't have done it without <noun>|celebrating with <food>}",
  ],
  post_news_reaction: [
    "{so|okay so} <news>. {thoughts?|we need to talk about this|of course it did}",
    "{wild news today:|can't believe it:} <news>. {<take>|called it in <year>}",
    "{<news>|apparently <news>}, {and somehow|and of course} {<noun> are getting blamed|nobody is surprised}",
    "{breaking|update} {for <topic> people|in <topic>}: <news>. {<tag>|the timeline is going to be chaos}",
  ],
  post_announcement: [
    "{big news|excited to share|it's official}: {I'm starting <thing>|<thing> is happening}. {more soon|details below}",
    "{announcing|introducing} {my new <thing> project|a weekly <topic> thread}. {come hang|first one is up}",
  ],
};
