import { Fragment, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { useColors } from '@/lib/theme';

/**
 * Lightweight Markdown for card faces and the French guide: **bold**, *italic* (nesting allowed),
 * `code`, bullet lists, headings, tables, quotes, fenced code and paragraphs — no webview.
 * `onPressItalic` makes italic runs tappable (French cards: tap to hear).
 */
export function CardText({
  source,
  style,
  center,
  onPressItalic,
}: {
  source: string;
  style?: TextStyle;
  center?: boolean;
  onPressItalic?: (text: string) => void;
}) {
  const c = useColors();
  const blocks = parseBlocks(source);
  const inline = (t: string) => renderInline(parseInline(t), { accent: c.accent, onPressItalic });
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => {
        if (b.type === 'code')
          return (
            <View key={i} style={[styles.codeBlock, { backgroundColor: c.subtle }]}>
              <Text style={[styles.mono, { color: c.fg }]}>{b.text}</Text>
            </View>
          );
        if (b.type === 'list')
          return (
            <View key={i} style={{ gap: 4 }}>
              {b.items.map((it, j) => (
                <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={[style, { color: c.faint }]}>{b.ordered ? `${j + 1}.` : '•'}</Text>
                  <Text style={[{ color: c.fg, flex: 1 }, style, { textAlign: 'left' }]}>{inline(it)}</Text>
                </View>
              ))}
            </View>
          );
        if (b.type === 'table')
          return (
            <View key={i} style={[styles.table, { borderColor: c.line }]}>
              {[b.head, ...b.rows].map((row, r) => (
                <View key={r} style={[styles.tr, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.line }, r === 0 && { backgroundColor: c.subtle }]}>
                  {row.map((cell, k) => (
                    <Text key={k} style={[styles.td, { color: c.fg, fontWeight: r === 0 ? '600' : '400' }]}>
                      {inline(cell)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          );
        if (b.type === 'quote')
          return (
            <View key={i} style={[styles.quote, { borderColor: c.line }]}>
              <Text style={[{ color: c.muted, fontStyle: 'italic' }, style]}>{inline(b.text)}</Text>
            </View>
          );
        if (b.type === 'heading')
          return (
            <Text
              key={i}
              style={[{ color: c.fg, fontWeight: '700' }, style, { fontSize: (style?.fontSize ?? 17) * (b.level <= 2 ? 1.25 : 1.1), marginTop: 6 }, center && { textAlign: 'center' }]}>
              {inline(b.text)}
            </Text>
          );
        return (
          <Text key={i} style={[{ color: c.fg }, style, center && { textAlign: 'center' }]}>
            {inline(b.text)}
          </Text>
        );
      })}
    </View>
  );
}

// ---------- inline ----------

type Inline = { t: 'text' | 'code'; v: string } | { t: 'b' | 'i'; kids: Inline[] };

/** Small recursive parser for **bold**, *italic* / _italic_ (bold allowed inside italic) and `code`. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Bold (but "***" opens italic that starts with bold).
    if (s.startsWith('**', i) && s[i + 2] !== '*' && s[i + 2] !== ' ') {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'b', kids: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] && s[i + 1] !== ' ' && (ch === '*' || !/\w/.test(s[i - 1] ?? ''))) {
      const end = findItalicEnd(s, i + 1, ch);
      if (end > i + 1) {
        flush();
        out.push({ t: 'i', kids: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** Index of the marker closing an italic run, skipping over **bold** pairs inside it. */
function findItalicEnd(s: string, from: number, mark: string) {
  let j = from;
  while (j < s.length) {
    if (mark === '*' && s.startsWith('**', j)) {
      const k = s.indexOf('**', j + 2);
      if (k < 0) return -1;
      j = k + 2;
      // "***": the bold closed and the italic closes on the third star.
      continue;
    }
    if (s[j] === mark && s[j - 1] !== ' ') return j;
    j++;
  }
  return -1;
}

const plain = (n: Inline[]): string => n.map((x) => ('v' in x ? x.v : plain(x.kids))).join('');

function renderInline(nodes: Inline[], o: { accent: string; onPressItalic?: (t: string) => void }): ReactNode {
  return nodes.map((n, i) => {
    if ('v' in n) return n.t === 'code' ? <Text key={i} style={[styles.mono, { fontSize: 15 }]}>{` ${n.v} `}</Text> : <Fragment key={i}>{n.v}</Fragment>;
    if (n.t === 'b') return <Text key={i} style={{ fontWeight: '700' }}>{renderInline(n.kids, o)}</Text>;
    const press = o.onPressItalic;
    return (
      <Text
        key={i}
        style={[{ fontStyle: 'italic' }, press && { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: o.accent }]}
        onPress={press ? () => press(plain(n.kids)) : undefined}
        suppressHighlighting={false}>
        {renderInline(n.kids, o)}
      </Text>
    );
  });
}

// ---------- blocks ----------

type Block =
  | { type: 'p' | 'code' | 'quote'; text: string }
  | { type: 'heading'; text: string; level: number }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'table'; head: string[]; rows: string[][] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((x) => x.trim());

function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r/g, '').split('\n');
  let para: string[] = [];
  let list: string[] = [];
  let ordered = false;
  const flush = () => {
    if (para.length) out.push({ type: 'p', text: para.join('\n') });
    if (list.length) out.push({ type: 'list', items: list, ordered });
    para = [];
    list = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      out.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    // Table: a pipe row followed by a |---| separator.
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      i--;
      out.push({ type: 'table', head, rows });
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) {
      flush();
      out.push({ type: 'heading', text: h[2], level: h[1].length });
      continue;
    }
    const q = line.match(/^>\s?(.*)/);
    if (q) {
      flush();
      out.push({ type: 'quote', text: q[1] });
      continue;
    }
    const li = line.match(/^\s*([-*+]|\d+\.)\s+(.*)/);
    if (li) {
      if (para.length) flush();
      if (!list.length) ordered = /\d/.test(li[1]);
      list.push(li[2]);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (list.length) flush();
    para.push(line);
  }
  flush();
  return out;
}

/** Plain text preview for list rows. */
export function stripMarkdown(s: string) {
  return s
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const styles = StyleSheet.create({
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 14 },
  codeBlock: { borderRadius: 10, padding: 12, borderCurve: 'continuous' },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  td: { flex: 1, paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, lineHeight: 18 },
  quote: { borderLeftWidth: 3, paddingLeft: 12 },
});
