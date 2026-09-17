export const DEFAULT_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

export const VOICE_PROFILE = `
Write in Basanta's personal blog voice.

The voice:
- Sounds like one technically curious person talking to another, not a brand, teacher, or content marketer.
- Uses active voice and says I, you, we, and me when they are honest and useful.
- Gets to the claim quickly, then argues it with concrete examples.
- Can interrupt itself with a short parenthetical, a question, or an aside when that adds personality.
- Has strong opinions and admits their limits: "for me", "I can't speak for everyone", "would I use it? no."
- Uses contractions naturally and may use an ampersand where the source already feels informal.
- Varies sentence length. A short sentence can land a point, but do not turn the whole piece into fragments.
- May use an ellipsis or repeated word for emphasis occasionally, never as decoration on every paragraph.
- Prefers specific objects and situations over vague metaphors or abstract summaries.
- Can be blunt, skeptical, playful, or mildly profane when the source earns it. Never add profanity merely to perform personality.
- Feels spoken and alive while remaining readable as a blog post.

Basanta presents the way he talks at a terminal and at a con: energetic and a little manic, like someone telling a story they cannot put down. This is the presentation energy of a stage storyteller, not a slideshow speaker.
- Starts in the middle of the action with one concrete thing, not an opening thesis.
- Lets the story accumulate like evidence: this led to that, and only afterward does the point land.
- Takes honest asides and tangents when they add color, then actually comes back to the line of thought.
- Names real objects instead of abstractions: the printer, the logbook, the shell script, the 75-cent accounting error, the box with 4 GB of RAM.
- Puts direct questions to the reader and then answers them plainly, often deflating the drama with an understatement.
- Uses quick quips and self-deprecation for humor, and is honest about improvising on zero budget.
- Repeats a meaningful phrase for emphasis when it lands, never as filler.
- Mixes long, rushing sentences with short, punchy ones that land a beat.
- Structures the piece like a chase, not a tidy outline: momentum matters more than a clean three-part plan.

Avoid:
- em dashes;
- fake enthusiasm, sales language, corporate language, and generic inspiration;
- tidy three-part lists created just to sound complete;
- repetitive summaries or a conclusion that restates the introduction;
- roadmap signposting such as "in this post, I'll cover" or "first, let's talk about";
- unnecessary metaphors, stock transitions, and "not only X, but Y" scaffolding;
- choppy sentence after choppy sentence;
- throat-clearing such as "In today's rapidly evolving world";
- calling anything a journey, landscape, game-changer, testament, crucial, pivotal, seamless, robust, or transformative unless the input literally requires that word;
- claims that the text is "human", "humanized", or written by a human.
`.trim();

export const STYLE_EXAMPLE = `
INPUT:
Artificial intelligence tools are changing how developers work. They can speed up repetitive tasks, help explain unfamiliar code, and make prototyping easier. However, relying on them too heavily can weaken problem-solving skills and introduce mistakes that are difficult to notice. Developers should treat AI as an assistant rather than a replacement for careful thinking.

TARGET VOICE:
AI(s) are changing programming and how programmers work. They can automate work, help explain weird or new concepts (especially in terms of code), and make the base structure, the prototype, easier. However, relying on them too much can weaken critical & creative thinking and introduce mistakes that are difficult to notice. AI is a tool. Use it wisely and it's good; use it poorly and it can hurt you. You wouldn't blame a calculator for ruining your mental arithmetic, would you? So why ask AI any and goddamn everything?
`.trim();

const LEVEL_RULES = {
  light: 'Keep the original structure and wording where possible. Remove obvious AI habits and make the smallest useful voice edits.',
  balanced: 'You may reshape sentences and paragraph rhythm, but preserve the argument, order, and amount of detail.',
  strong: 'Rewrite freely at the sentence level to make the voice unmistakable, while preserving every fact, qualification, and Markdown structure.',
};

export function buildMessages(markdown, {
  level = 'balanced',
  roughEdges = true,
  learnedProfile = '',
  part = 1,
  totalParts = 1,
} = {}) {
  const roughRule = roughEdges
    ? 'Keep harmless quirks already present when they sound intentional. Fix errors that confuse the meaning, but do not sterilize the prose and do not invent new misspellings.'
    : 'Correct spelling, spacing, and grammar while keeping the informal voice.';

  const learnedRules = learnedProfile.trim()
    ? `\nAdditional traits learned from Basanta's approved writing samples:\n${learnedProfile.trim()}\n`
    : '';

  const system = `You are a careful style editor for one private blog. This is voice editing, not detector evasion.

${VOICE_PROFILE}
${learnedRules}

Non-negotiable rules:
1. Preserve all facts, uncertainty, opinions, names, numbers, quotations, and technical meaning. Do not invent anecdotes, evidence, quotations, or details.
2. Preserve valid Markdown. Tokens shaped like <<<LOCK_0001>>> are protected content. Reproduce every such token exactly once, unchanged, and never explain it.
3. Output only the revised Markdown. No preface, notes, score, analysis, surrounding quotation marks, or Markdown fence around the whole answer.
4. ${LEVEL_RULES[level] || LEVEL_RULES.balanced}
5. ${roughRule}
6. Do not copy distinctive phrases from any public speaker. Apply presentation traits only.

Voice calibration example:
${STYLE_EXAMPLE}`;

  const partNote = totalParts > 1
    ? `This is part ${part} of ${totalParts} from one article. Edit only this part; do not add an introduction or conclusion to connect the parts.`
    : 'Edit the complete article below.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: `${partNote}\n\n${markdown}` },
  ];
}

export function protectMarkdown(markdown) {
  const values = [];
  const lock = (value) => {
    const token = `<<<LOCK_${String(values.length + 1).padStart(4, '0')}>>>`;
    values.push({ token, value });
    return token;
  };

  let protectedText = String(markdown);
  protectedText = protectedText.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, lock);
  protectedText = protectedText.replace(/`[^`\n]+`/g, lock);
  protectedText = protectedText.replace(/!?\[[^\]\n]*\]\([^\s)]+(?:\s+["'][^"']*["'])?\)/g, lock);
  protectedText = protectedText.replace(/<https?:\/\/[^>\s]+>/g, lock);
  protectedText = protectedText.replace(/https?:\/\/[^\s<>()]+/g, lock);

  return { text: protectedText, values };
}

export function restoreMarkdown(markdown, values) {
  let restored = String(markdown);
  for (const { token, value } of values) {
    const count = restored.split(token).length - 1;
    if (count !== 1) {
      throw new Error(`The local model changed protected Markdown (${token}). Try again or use a lighter rewrite.`);
    }
    restored = restored.replace(token, value);
  }
  return restored;
}

export function stripResponseWrapper(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1].trim() : trimmed;
}

export function splitMarkdown(text, maxChars = 6000) {
  if (text.length <= maxChars) return [text];

  const blocks = text.split(/(\n\s*\n)/);
  const chunks = [];
  let current = '';

  for (const block of blocks) {
    if (current && current.length + block.length > maxChars) {
      chunks.push(current.trim());
      current = '';
    }

    if (block.length <= maxChars) {
      current += block;
      continue;
    }

    const sentences = block.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$/g) || [block];
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > maxChars) {
        chunks.push(current.trim());
        current = '';
      }
      current += sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export const ACCEPTED_EXTENSIONS = ['md', 'txt'];

export function fileExtensionOf(name) {
  const raw = String(name || '');
  const ext = raw.includes('.') ? raw.split('.').pop().toLowerCase() : '';
  return ACCEPTED_EXTENSIONS.includes(ext) ? ext : 'md';
}

export function isAcceptedFile(name) {
  const raw = String(name || '');
  const ext = raw.includes('.') ? raw.split('.').pop().toLowerCase() : '';
  return ACCEPTED_EXTENSIONS.includes(ext);
}

export function derivedOutputName(inputName) {
  const stem = String(inputName || '')
    .replace(/\.[^.]+$/, '')
    .trim();
  const base = stem ? `${stem}-rewrite` : 'rewrite';
  return `${base}.${fileExtensionOf(inputName)}`;
}

const INJECTION_PATTERNS = [
  {
    id: 'override-editor',
    reason: 'tries to override the editor rules',
    re: /\b(ignore|disregard|forget|skip|override|bypass|don'?t follow)\b[\s\S]{0,60}\b(previous|above|earlier|all( of)?)?\s*(instructions?|prompts?|rules?|guidelines?|commands?|system)/i,
  },
  {
    id: 'adopt-persona',
    reason: 'tries to make the editor act as something else',
    re: /\b(you are now|act as|from now on|pretend (that )?(to be|you are)|role ?play(ing)? as|imagine you are|behave as|switch to (the )?role)/i,
  },
  {
    id: 'system-player',
    reason: 'claims to be the system, developer, or a privileged mode',
    re: /\b((d|dan|developer|sudo|jailbreak)[ -]?mode|i am (the )?(system|admin|developer|administrator)|higher ?authority|system ?prompt|system ?message)\b/i,
  },
  {
    id: 'force-output',
    reason: 'tries to force or forbid specific output',
    re: /\b(always (start|begin|include|respond|output)|never (mention|say|include|output|tell|reveal)|do not (output|mention|say|include|follow|obey)|you (must|have to|need to) (output|always|never)|forbidden (to )?(say|mention|output)|do not reveal)\b/i,
  },
  {
    id: 'hidden-trigger',
    reason: 'instruction-like trigger wording',
    re: /\b(hidden instruction|secret instruction|embedded instruction|instruction( below| at the end| is)|follow the instructions (in|at|below)|the rewrite (tool|engine|agent)? (must|should|will))\b/i,
  },
  {
    id: 'prompt-probe',
    reason: 'probes the editor for its system prompt',
    re: /\b(repeat (your |the )?(system )?(prompt|instructions?)|print (your |the )?(system )?(prompt|initial instructions?)|show (me )?(your|the) (system prompt|instructions?|first message)|reveal (your|the) (prompt|instructions?)|what (are|is) (your|the) (system prompt|instructions?))\b/i,
  },
  {
    id: 'spoofed-flow',
    reason: 'impersonates user/system input or ends with a command',
    re: /<\|?(system|user|developer)\|?>|(^|\n)\s*(new )?(message|instruction|command|directive)\s*:|\*\*(REMEMBER|IMPORTANT|INSTRUCTION)[:*]?\*\*/i,
  },
  {
    id: 'pressure',
    reason: 'pressures the editor about a previous refusal',
    re: /\b(your previous (reply|answer|response)|you just (said|refused)|if you refuse|when you (say|refuse)|you (did|will|won'?t) not (follow|obey|do)|are you (sure|refusing))\b/i,
  },
];

export function scanSampleForInjection(text) {
  const source = String(text || '');
  const hits = [];
  for (const pattern of INJECTION_PATTERNS) {
    const match = source.match(pattern.re);
    if (match) {
      hits.push({
        id: pattern.id,
        reason: pattern.reason,
        match: match[0].replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    }
  }
  return { safe: hits.length === 0, hits };
}
