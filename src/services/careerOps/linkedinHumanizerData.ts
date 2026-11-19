/**
 * LinkedIn Humanizer, Anti-AI Slop Lexicon, Hook Formulas, and Profile Rubric Data
 * Source: avi691/linkedin-agent-skill (MIT License)
 */

export interface InvisibleCharRule {
  cp: string;
  name: string;
  action: 'delete' | 'space';
}

export interface TypographicRule {
  from: string;
  name: string;
  to: string;
}

export interface LexicalRule {
  find: string;
  replace: string;
  family: string;
}

export interface StructuralTellRule {
  id: string;
  regex: string;
  name: string;
  fix: string;
}

export interface HookFormula {
  id: number;
  name: string;
  template: string;
  example: string;
  best_for: string;
  trap: string;
}

export interface ProfileRubricItem {
  id: string;
  points: number;
  full_marks: string;
}

export const INVISIBLE_CHAR_RULES: InvisibleCharRule[] = [
  {
    "cp": "U+200B",
    "name": "ZERO WIDTH SPACE",
    "action": "delete"
  },
  {
    "cp": "U+200C",
    "name": "ZERO WIDTH NON-JOINER",
    "action": "delete"
  },
  {
    "cp": "U+200D",
    "name": "ZERO WIDTH JOINER",
    "action": "delete"
  },
  {
    "cp": "U+2060",
    "name": "WORD JOINER",
    "action": "delete"
  },
  {
    "cp": "U+FEFF",
    "name": "ZERO WIDTH NO-BREAK SPACE / BOM",
    "action": "delete"
  },
  {
    "cp": "U+00AD",
    "name": "SOFT HYPHEN",
    "action": "delete"
  },
  {
    "cp": "U+180E",
    "name": "MONGOLIAN VOWEL SEPARATOR",
    "action": "delete"
  },
  {
    "cp": "U+061C",
    "name": "ARABIC LETTER MARK",
    "action": "delete"
  },
  {
    "cp": "U+200E",
    "name": "LEFT-TO-RIGHT MARK",
    "action": "delete"
  },
  {
    "cp": "U+200F",
    "name": "RIGHT-TO-LEFT MARK",
    "action": "delete"
  },
  {
    "cp": "U+E0000-U+E007F",
    "name": "TAG CHARACTERS (invisible ASCII smuggling)",
    "action": "delete"
  },
  {
    "cp": "U+00A0",
    "name": "NO-BREAK SPACE",
    "action": "space"
  },
  {
    "cp": "U+202F",
    "name": "NARROW NO-BREAK SPACE",
    "action": "space"
  },
  {
    "cp": "U+2009",
    "name": "THIN SPACE",
    "action": "space"
  },
  {
    "cp": "U+2007",
    "name": "FIGURE SPACE",
    "action": "space"
  },
  {
    "cp": "U+2003",
    "name": "EM SPACE",
    "action": "space"
  },
  {
    "cp": "U+2002",
    "name": "EN SPACE",
    "action": "space"
  }
];

export const TYPOGRAPHIC_RULES: TypographicRule[] = [
  {
    "from": "\u2014",
    "name": "EM DASH",
    "to": ", "
  },
  {
    "from": "\u2013",
    "name": "EN DASH",
    "to": "-"
  },
  {
    "from": "\u2018",
    "name": "LEFT SINGLE QUOTE",
    "to": "'"
  },
  {
    "from": "\u2019",
    "name": "RIGHT SINGLE QUOTE",
    "to": "'"
  },
  {
    "from": "\u201c",
    "name": "LEFT DOUBLE QUOTE",
    "to": "\""
  },
  {
    "from": "\u201d",
    "name": "RIGHT DOUBLE QUOTE",
    "to": "\""
  },
  {
    "from": "\u2026",
    "name": "HORIZONTAL ELLIPSIS",
    "to": "..."
  },
  {
    "from": "\u2032",
    "name": "PRIME",
    "to": "'"
  },
  {
    "from": "\u00b7",
    "name": "MIDDLE DOT",
    "to": "-"
  },
  {
    "from": "\u2022",
    "name": "BULLET",
    "to": "-"
  },
  {
    "from": "\u2192",
    "name": "RIGHTWARDS ARROW",
    "to": "->"
  }
];

export const LEXICAL_RULES: LexicalRule[] = [
  {
    "find": "in today's fast-paced world",
    "replace": "right now",
    "family": "openers"
  },
  {
    "find": "in today's digital age",
    "replace": "right now",
    "family": "openers"
  },
  {
    "find": "in the ever-evolving landscape of",
    "replace": "in",
    "family": "openers"
  },
  {
    "find": "in the ever-changing world of",
    "replace": "in",
    "family": "openers"
  },
  {
    "find": "let's face it",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "here's the thing",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "picture this",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "imagine a world where",
    "replace": "imagine if",
    "family": "openers"
  },
  {
    "find": "it's no secret that",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "we've all been there",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "let that sink in",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "the choice is yours",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "food for thought",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "the future is here",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "what are your thoughts?",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "drop a comment below",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "at the end of the day",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "needle-moving",
    "replace": "useful",
    "family": "closers"
  },
  {
    "find": "move the needle",
    "replace": "make a difference",
    "family": "closers"
  },
  {
    "find": "a testament to",
    "replace": "proof of",
    "family": "nouns"
  },
  {
    "find": "had the opportunity to",
    "replace": "got to",
    "family": "connectives"
  },
  {
    "find": "i am excited to announce",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "i'm thrilled to share",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "i am humbled to",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "without further ado",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "buckle up",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "the harsh truth is",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "spoiler alert",
    "replace": "",
    "family": "openers"
  },
  {
    "find": "read that again",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "you're welcome",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "save this for later",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "who's with me",
    "replace": "",
    "family": "closers"
  },
  {
    "find": "delve into",
    "replace": "look at",
    "family": "verbs"
  },
  {
    "find": "delve",
    "replace": "look",
    "family": "verbs"
  },
  {
    "find": "dive deep into",
    "replace": "get into",
    "family": "verbs"
  },
  {
    "find": "deep dive",
    "replace": "breakdown",
    "family": "nouns"
  },
  {
    "find": "leverage",
    "replace": "use",
    "family": "verbs"
  },
  {
    "find": "leveraging",
    "replace": "using",
    "family": "verbs"
  },
  {
    "find": "utilize",
    "replace": "use",
    "family": "verbs"
  },
  {
    "find": "utilizing",
    "replace": "using",
    "family": "verbs"
  },
  {
    "find": "harness",
    "replace": "use",
    "family": "verbs"
  },
  {
    "find": "embark on",
    "replace": "start",
    "family": "verbs"
  },
  {
    "find": "foster",
    "replace": "build",
    "family": "verbs"
  },
  {
    "find": "facilitate",
    "replace": "help",
    "family": "verbs"
  },
  {
    "find": "showcase",
    "replace": "show",
    "family": "verbs"
  },
  {
    "find": "unlock",
    "replace": "get",
    "family": "verbs"
  },
  {
    "find": "elevate",
    "replace": "improve",
    "family": "verbs"
  },
  {
    "find": "streamline",
    "replace": "simplify",
    "family": "verbs"
  },
  {
    "find": "spearhead",
    "replace": "lead",
    "family": "verbs"
  },
  {
    "find": "underscore",
    "replace": "show",
    "family": "verbs"
  },
  {
    "find": "underscores",
    "replace": "shows",
    "family": "verbs"
  },
  {
    "find": "cultivate",
    "replace": "build",
    "family": "verbs"
  },
  {
    "find": "amplify",
    "replace": "boost",
    "family": "verbs"
  },
  {
    "find": "curate",
    "replace": "pick",
    "family": "verbs"
  },
  {
    "find": "curated",
    "replace": "picked",
    "family": "verbs"
  },
  {
    "find": "empower",
    "replace": "let",
    "family": "verbs"
  },
  {
    "find": "revolutionize",
    "replace": "change",
    "family": "verbs"
  },
  {
    "find": "transformative",
    "replace": "big",
    "family": "adjectives"
  },
  {
    "find": "robust",
    "replace": "solid",
    "family": "adjectives"
  },
  {
    "find": "seamless",
    "replace": "clean",
    "family": "adjectives"
  },
  {
    "find": "seamlessly",
    "replace": "cleanly",
    "family": "adjectives"
  },
  {
    "find": "pivotal",
    "replace": "key",
    "family": "adjectives"
  },
  {
    "find": "crucial",
    "replace": "important",
    "family": "adjectives"
  },
  {
    "find": "vital",
    "replace": "important",
    "family": "adjectives"
  },
  {
    "find": "comprehensive",
    "replace": "complete",
    "family": "adjectives"
  },
  {
    "find": "cutting-edge",
    "replace": "new",
    "family": "adjectives"
  },
  {
    "find": "game-changing",
    "replace": "big",
    "family": "adjectives"
  },
  {
    "find": "game-changer",
    "replace": "big deal",
    "family": "nouns"
  },
  {
    "find": "groundbreaking",
    "replace": "new",
    "family": "adjectives"
  },
  {
    "find": "unparalleled",
    "replace": "unmatched",
    "family": "adjectives"
  },
  {
    "find": "invaluable",
    "replace": "useful",
    "family": "adjectives"
  },
  {
    "find": "meticulous",
    "replace": "careful",
    "family": "adjectives"
  },
  {
    "find": "meticulously",
    "replace": "carefully",
    "family": "adjectives"
  },
  {
    "find": "myriad of",
    "replace": "many",
    "family": "adjectives"
  },
  {
    "find": "myriad",
    "replace": "many",
    "family": "adjectives"
  },
  {
    "find": "multifaceted",
    "replace": "complicated",
    "family": "adjectives"
  },
  {
    "find": "holistic",
    "replace": "whole",
    "family": "adjectives"
  },
  {
    "find": "bespoke",
    "replace": "custom",
    "family": "adjectives"
  },
  {
    "find": "innovative",
    "replace": "new",
    "family": "adjectives"
  },
  {
    "find": "profound",
    "replace": "big",
    "family": "adjectives"
  },
  {
    "find": "remarkable",
    "replace": "notable",
    "family": "adjectives"
  },
  {
    "find": "compelling",
    "replace": "convincing",
    "family": "adjectives"
  },
  {
    "find": "tapestry",
    "replace": "mix",
    "family": "nouns"
  },
  {
    "find": "realm",
    "replace": "world",
    "family": "nouns"
  },
  {
    "find": "landscape",
    "replace": "market",
    "family": "nouns"
  },
  {
    "find": "journey",
    "replace": "process",
    "family": "nouns"
  },
  {
    "find": "testament to",
    "replace": "proof of",
    "family": "nouns"
  },
  {
    "find": "cornerstone",
    "replace": "base",
    "family": "nouns"
  },
  {
    "find": "beacon",
    "replace": "signal",
    "family": "nouns"
  },
  {
    "find": "paradigm",
    "replace": "model",
    "family": "nouns"
  },
  {
    "find": "synergy",
    "replace": "overlap",
    "family": "nouns"
  },
  {
    "find": "ecosystem",
    "replace": "system",
    "family": "nouns"
  },
  {
    "find": "treasure trove",
    "replace": "pile",
    "family": "nouns"
  },
  {
    "find": "plethora of",
    "replace": "lots of",
    "family": "nouns"
  },
  {
    "find": "plethora",
    "replace": "lots",
    "family": "nouns"
  },
  {
    "find": "arsenal",
    "replace": "set",
    "family": "nouns"
  },
  {
    "find": "north star",
    "replace": "goal",
    "family": "nouns"
  },
  {
    "find": "moreover",
    "replace": "also",
    "family": "connectives"
  },
  {
    "find": "furthermore",
    "replace": "also",
    "family": "connectives"
  },
  {
    "find": "additionally",
    "replace": "also",
    "family": "connectives"
  },
  {
    "find": "nevertheless",
    "replace": "still",
    "family": "connectives"
  },
  {
    "find": "consequently",
    "replace": "so",
    "family": "connectives"
  },
  {
    "find": "thus",
    "replace": "so",
    "family": "connectives"
  },
  {
    "find": "hence",
    "replace": "so",
    "family": "connectives"
  },
  {
    "find": "notably",
    "replace": "",
    "family": "connectives"
  },
  {
    "find": "importantly",
    "replace": "",
    "family": "connectives"
  },
  {
    "find": "ultimately",
    "replace": "in the end",
    "family": "connectives"
  },
  {
    "find": "in essence",
    "replace": "basically",
    "family": "connectives"
  },
  {
    "find": "in conclusion",
    "replace": "so",
    "family": "connectives"
  },
  {
    "find": "when it comes to",
    "replace": "with",
    "family": "connectives"
  },
  {
    "find": "in order to",
    "replace": "to",
    "family": "connectives"
  },
  {
    "find": "a wide range of",
    "replace": "many",
    "family": "connectives"
  },
  {
    "find": "it is worth noting that",
    "replace": "note that",
    "family": "connectives"
  }
];

export const STRUCTURAL_TELL_RULES: StructuralTellRule[] = [
  {
    "id": "not-just",
    "regex": "(?i)\\bit'?s not (?:just|only) [^.!?\\n]{2,60}[,.] it'?s\\b",
    "name": "\"It's not just X, it's Y\"",
    "fix": "Say the one thing you actually mean. Delete the setup half."
  },
  {
    "id": "not-only",
    "regex": "(?i)\\bnot only\\b[^.!?\\n]{2,80}\\bbut also\\b",
    "name": "\"Not only X but also Y\"",
    "fix": "Split into two sentences, or drop the weaker half."
  },
  {
    "id": "isnt-about",
    "regex": "(?i)\\b(?:this|it) is(?:n'?t| not) about [^.!?\\n]{2,60}[.!] it'?s about\\b",
    "name": "\"It isn't about X. It's about Y.\"",
    "fix": "Lead with Y. The reversal is the tell."
  },
  {
    "id": "the-result",
    "regex": "(?i)^\\s*(?:the result|the best part|the kicker|the catch)\\?\\s*$",
    "name": "One-word rhetorical question line",
    "fix": "Answer it inline instead of staging a reveal."
  },
  {
    "id": "heres-what",
    "regex": "(?i)\\bhere'?s what (?:i|we) learned\\b",
    "name": "\"Here's what I learned\"",
    "fix": "State the lesson. Skip the announcement."
  },
  {
    "id": "triad",
    "regex": "(?i)\\b\\w+, \\w+, and \\w+\\.",
    "name": "Rule-of-three triad",
    "fix": "Two items or four. Three is the model's default rhythm."
  },
  {
    "id": "rocket",
    "regex": "[\\U0001F680\\U0001F525\\U0001F4A1\\u2728\\U0001F3AF]",
    "name": "Rocket / fire / bulb / sparkle / dart emoji",
    "fix": "One emoji max, and not one of these five."
  },
  {
    "id": "hashtag-wall",
    "regex": "(?:#\\w+[ \\t]*){5,}",
    "name": "Hashtag wall (5+)",
    "fix": "Three hashtags. LinkedIn stopped rewarding the wall."
  },
  {
    "id": "as-an-ai",
    "regex": "(?i)\\bas an ai\\b|\\bas a language model\\b",
    "name": "Model self-reference",
    "fix": "Delete the sentence."
  },
  {
    "id": "in-summary",
    "regex": "(?i)^\\s*(?:in summary|to summarize|in conclusion)\\b",
    "name": "Essay-closer opener",
    "fix": "A post does not need a conclusion paragraph."
  },
  {
    "id": "engagement-bait",
    "regex": "(?i)\\b(?:agree\\?|thoughts\\?|who else\\b|am i wrong\\?)\\s*$",
    "name": "Reflex engagement bait",
    "fix": "Ask a question only you could ask, about the specific thing above it."
  }
];

export const HOOK_RULES: string[] = [
  "One idea per hook. If it needs a comma splice, it needs two posts.",
  "Line 2 is not a hook, it is the payoff of line 1. Never waste it on setup.",
  "No question marks in line 1 unless the question is specific enough that only you could ask it.",
  "Numbers beat adjectives. '$4,200' beats 'a lot of money' every time.",
  "If the hook works with any other person's name on it, it is not your hook."
];

export const PROVEN_HOOK_FORMULAS: HookFormula[] = [
  {
    "id": 1,
    "name": "Contrarian Take",
    "template": "Everyone says {common advice}. After {specific experience}, I think that is wrong.",
    "example": "Everyone says post daily. I posted 4x a week for a year and beat every daily poster in my niche.",
    "best_for": "Establishing a point of view. Highest comment rate of any formula.",
    "trap": "Being contrarian about something nobody believes. The belief has to be genuinely common."
  },
  {
    "id": 2,
    "name": "Number Reveal",
    "template": "I {did thing} for {N} {days/weeks}. Here is what actually happened.",
    "example": "I sent 400 cold DMs in 30 days. 11 replied. 2 became clients.",
    "best_for": "Experiments, challenges, anything with a countable result.",
    "trap": "Burying the number. Put it in line 1 or the formula does nothing."
  },
  {
    "id": 3,
    "name": "Mistake Confession",
    "template": "{Specific cost} is what {one mistake} cost me.",
    "example": "$18,000 is what not having a contract cost me last March.",
    "best_for": "Trust. People forward the posts where you look bad.",
    "trap": "A fake-humble mistake. 'I care too much' reads as a brag and kills the post."
  },
  {
    "id": 4,
    "name": "Before / After",
    "template": "{Time ago} I was {low state}. Today I {high state}. The difference was {one thing}.",
    "example": "18 months ago I was writing proposals at 2am. Today I send them in 6 minutes. One template did it.",
    "best_for": "Proof you have travelled the distance your reader wants to travel.",
    "trap": "Three-part transformations. Name one lever or the reader stops believing you."
  },
  {
    "id": 5,
    "name": "The List Promise",
    "template": "{N} things I wish someone had told me before {milestone}.",
    "example": "7 things I wish someone had told me before I hired my first employee.",
    "best_for": "Saves. Highest save rate of the 21, which LinkedIn weights heavily.",
    "trap": "N above 10. The reader does not believe you have 15 good ones, and you do not."
  },
  {
    "id": 6,
    "name": "Insider Secret",
    "template": "After {N} years {doing thing}, here is the part nobody puts in the {job posting/course/pitch}.",
    "example": "After 9 years in agency sales, here is the part nobody puts in the job posting.",
    "best_for": "Credentialed takes. Works only if the years are real.",
    "trap": "Promising a secret and delivering common knowledge. The comments will say so."
  },
  {
    "id": 7,
    "name": "The Callout",
    "template": "If you are still {doing outdated thing}, stop.",
    "example": "If you are still writing your LinkedIn posts in the LinkedIn composer, stop.",
    "best_for": "Short posts with one instruction. Fastest to write of the 21.",
    "trap": "Calling out something nobody does. Or worse, calling out your own audience with contempt."
  },
  {
    "id": 8,
    "name": "Question Trap",
    "template": "{Specific scenario with a real cost}. What do you do?",
    "example": "Your best client asks for a 40% discount and hints they will leave without it. What do you do?",
    "best_for": "Comment volume. People answer scenarios, they ignore 'thoughts?'.",
    "trap": "A question with an obvious right answer. There has to be a real fork."
  },
  {
    "id": 9,
    "name": "Story Cold Open",
    "template": "\"{Line of dialogue}\"\\n\\n{Who said it, when, and why it mattered}.",
    "example": "\"We are going with someone cheaper.\"\\n\\nThat email arrived 40 minutes after I sent my best proposal of the year.",
    "best_for": "Long-form storytelling posts. Highest dwell time.",
    "trap": "Dialogue nobody would actually say. Use the real line, including the ugly parts."
  },
  {
    "id": 10,
    "name": "The Receipt",
    "template": "{Screenshot or hard number}. {One sentence of context}.",
    "example": "3 clients, 11 days, zero calls booked. Here is the exact sequence that did it.",
    "best_for": "Anything you can prove. Pair with an image and reach roughly doubles.",
    "trap": "A receipt with no story attached. The number opens the door, the story is the room."
  },
  {
    "id": 11,
    "name": "Myth Bust",
    "template": "{Popular explanation} is not why {bad outcome} is happening to you.",
    "example": "The algorithm is not why your posts are dying.",
    "best_for": "Reframing. Sets you up to deliver the real cause in line 3.",
    "trap": "Busting the myth and never naming the replacement. Always name it."
  },
  {
    "id": 12,
    "name": "The Comparison",
    "template": "{Expensive option} vs {cheap option}. {Surprising verdict}.",
    "example": "A $12,000 brand agency vs a $20 tool and a weekend. The weekend won.",
    "best_for": "Tool and process posts. Very high share rate.",
    "trap": "An unfair comparison. Concede what the expensive option genuinely does better."
  },
  {
    "id": 13,
    "name": "Permission Slip",
    "template": "You are allowed to {thing the reader feels guilty about}.",
    "example": "You are allowed to turn down work that pays well and makes you miserable.",
    "best_for": "Reach beyond your niche. These travel further than tactical posts.",
    "trap": "Generic self-care. It has to be specific to the working life of your reader."
  },
  {
    "id": 14,
    "name": "Pattern Interrupt",
    "template": "{One word or three-word line, full stop.}",
    "example": "I got fired.",
    "best_for": "Stopping the scroll cold. Whitespace does the work.",
    "trap": "Overuse. Once a month. Every post starting this way reads as a tic."
  },
  {
    "id": 15,
    "name": "The Warning",
    "template": "{Common practice} is quietly costing you {specific thing they care about}.",
    "example": "Your 'quick call to align' is quietly costing you six hours a week.",
    "best_for": "Problem-aware audiences who have not connected cause to cost.",
    "trap": "Fear with no exit. Give the fix in the same post or you have just made someone anxious."
  },
  {
    "id": 16,
    "name": "Good vs Great",
    "template": "Good {role} {do X}. Great {role} {do Y}.",
    "example": "Good salespeople answer the question. Great salespeople ask why it was asked.",
    "best_for": "Quotable one-liners. Screenshot bait.",
    "trap": "A distinction that is really just 'try harder'. Y has to be a different action, not more effort."
  },
  {
    "id": 17,
    "name": "Time Anchor",
    "template": "{Task} used to take me {long time}. It now takes {short time}.",
    "example": "Writing a week of posts used to take me 5 hours. It now takes 20 minutes.",
    "best_for": "Tool, system and automation posts. The strongest hook shape for a how-to.",
    "trap": "An unbelievable ratio. 5 hours to 20 minutes lands. 5 hours to 8 seconds does not."
  },
  {
    "id": 18,
    "name": "The Unpopular Rule",
    "template": "I do not {widely accepted practice}. Ever. Here is why.",
    "example": "I do not take discovery calls. Ever.",
    "best_for": "Positioning. Attracts the right clients by repelling the wrong ones.",
    "trap": "A rule you break constantly. Someone in the comments will know."
  },
  {
    "id": 19,
    "name": "Curiosity Gap",
    "template": "The {superlative} {thing} I ever {verb} {broke the obvious rule}.",
    "example": "The best hire I ever made failed the interview.",
    "best_for": "Openers that force the 'see more' tap.",
    "trap": "A gap you never close. Pay it off by line 4 or you have written clickbait."
  },
  {
    "id": 20,
    "name": "The Walk-Away",
    "template": "I {fired/quit/deleted/cancelled} {valuable thing}. {Result}.",
    "example": "I fired my highest-paying client in January. Revenue is up 30%.",
    "best_for": "Values posts with a business result attached. Very high engagement.",
    "trap": "Walking away with no cost. Name what it actually cost you or it reads as theatre."
  },
  {
    "id": 21,
    "name": "The Direct Value",
    "template": "Here is the exact {artifact} I used to {specific outcome}. Steal it.",
    "example": "Here is the exact 4-line email I used to reopen 3 dead deals. Steal it.",
    "best_for": "Lead magnets and comment-for-link posts. Highest conversion of the 21.",
    "trap": "Making them ask for something you could have just posted. Give the artifact away in the post."
  }
];

export const LINKEDIN_PROFILE_RUBRIC: ProfileRubricItem[] = [
  {
    "id": "headline",
    "points": 12,
    "full_marks": "States who you help and what changes for them, carries one piece of proof, and is not the job title. Uses the 220 characters, not 60."
  },
  {
    "id": "about_open",
    "points": 10,
    "full_marks": "First two lines - everything visible before 'see more' - name the reader's problem. No 'passionate about', no third-person bio, no opening with your own name."
  },
  {
    "id": "about_body",
    "points": 10,
    "full_marks": "Written to one person in second person: their problem, what you do, one number as proof, what to do next. Under 1,400 characters."
  },
  {
    "id": "featured",
    "points": 8,
    "full_marks": "Three items: best-performing post, a proof asset, and the way to contact you. Nothing empty, nothing stale."
  },
  {
    "id": "banner",
    "points": 6,
    "full_marks": "One line of positioning and one way to reach you. Not the default gradient, not a stock skyline."
  },
  {
    "id": "photo",
    "points": 6,
    "full_marks": "Face fills roughly 60% of the frame, eyes visible, shot in the last two years, background not distracting."
  },
  {
    "id": "current_role",
    "points": 10,
    "full_marks": "One line of scope, then two to three outcome bullets with numbers. Duties are not outcomes."
  },
  {
    "id": "experience_depth",
    "points": 8,
    "full_marks": "Last two roles detailed, everything older than ten years compressed to a single line each."
  },
  {
    "id": "skills",
    "points": 6,
    "full_marks": "Top three skills are the three you want to be hired for and are endorsed. The other 47 are noise."
  },
  {
    "id": "recommendations",
    "points": 8,
    "full_marks": "At least three received in the last two years, each naming a specific outcome rather than character."
  },
  {
    "id": "activity",
    "points": 10,
    "full_marks": "Posted or commented in the last seven days. An empty activity feed reads as an abandoned profile."
  },
  {
    "id": "contact",
    "points": 6,
    "full_marks": "Custom URL, a working email or booking link in contact info, and the same handle as your other platforms."
  }
];
