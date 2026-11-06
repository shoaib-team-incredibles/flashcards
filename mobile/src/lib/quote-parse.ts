/**
 * Turn a pasted note into separate quotes.
 *
 * - Quotes are separated by blank lines. Lines inside one block are split
 *   into separate quotes only when each line is a complete quote with no
 *   author (so a two-line dialogue followed by "-- Source" stays together).
 * - A trailing source becomes the author: `"…" -- Mark Twain`, `"…" Ron Swanson`,
 *   `… — Gabor Mate`. Unquoted text only takes an author after a dash and
 *   when it looks like a name, so `90/90 rule -- when you think…` stays whole.
 * - Wrapping quote marks are removed; quote marks inside the text are kept.
 */

export interface ParsedQuote {
  text: string;
  author: string;
}

/** Longest quote (text plus "— author") that still reads well as a notification. */
export const NOTIFICATION_MAX_CHARS = 180;

export function notificationLength(q: ParsedQuote) {
  return q.text.length + (q.author ? q.author.length + 3 : 0);
}

export function fitsNotification(q: ParsedQuote) {
  return notificationLength(q) <= NOTIFICATION_MAX_CHARS;
}

const OPEN = '"“';
const CLOSE = '"”';
const DQ = /["“”]/g;

const quoteMarks = (s: string) => (s.match(DQ) ?? []).length;

/** Author after a closing quote mark, with or without a dash before it. */
const AFTER_QUOTE = /^([\s\S]*["”])\s*(?:--|—|–|-)?\s*([^"“”\n]+?)\s*$/;
/** Author after a dash on unquoted text. */
const AFTER_DASH = /^([\s\S]*?\S)\s*(?:--|—|–)\s*([^"“”\n]+?)\s*$/;

const words = (s: string) => s.trim().split(/\s+/).length;

function splitAuthor(raw: string): ParsedQuote {
  const s = raw.trim();

  const q = s.match(AFTER_QUOTE);
  if (q && quoteMarks(q[1]) % 2 === 0) {
    const author = q[2].trim();
    // A sentence of commentary after the quote isn't an author.
    if (author && words(author) <= 8 && !/[.!?]$/.test(author)) return { text: q[1], author };
  }

  if (!OPEN.includes(s[0])) {
    const d = s.match(AFTER_DASH);
    if (d && /^[A-Z]/.test(d[2]) && words(d[2]) <= 5 && !/[.!?]$/.test(d[2])) return { text: d[1], author: d[2].trim() };
  }

  return { text: s, author: '' };
}

function clean(text: string) {
  let t = text.trim();
  if (OPEN.includes(t[0]) && CLOSE.includes(t[t.length - 1]) && quoteMarks(t) === 2) t = t.slice(1, -1);
  return t
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

/** A line that is a whole quote by itself: balanced quote marks and no author. */
function standsAlone(line: string) {
  return quoteMarks(line) % 2 === 0 && !splitAuthor(line).author;
}

export function parseQuotes(input: string): ParsedQuote[] {
  const blocks = input
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const out: ParsedQuote[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const pieces = lines.length > 1 && lines.every(standsAlone) ? lines : [lines.join('\n')];
    for (const piece of pieces) {
      const { text, author } = splitAuthor(piece);
      const t = clean(text);
      if (t) out.push({ text: t, author: author.replace(/^[-—–\s]+/, '').trim() });
    }
  }
  return out;
}
