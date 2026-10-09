// A small markdown reader for skinned replies: blocks, and inline spans to color.
// Tables, the one thing it does not lay out, stay markdown for the engine's own drawing.

export type Inline = { text: string; kind: 'plain' | 'bold' | 'italic' | 'code' | 'link'; href?: string }

export type Block =
  | { kind: 'heading'; level: number; spans: Inline[] }
  | { kind: 'para'; spans: Inline[] }
  | { kind: 'item'; marker: string; depth: number; spans: Inline[] }
  | { kind: 'quote'; spans: Inline[] }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'rule' }
  | { kind: 'markdown'; text: string }

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/
const FENCE_END = /^\s*(```|~~~)\s*$/
const HEADING = /^(#{1,6})\s+(.*)$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

// Code ticks, **bold**, __bold__, [links](url), *italic* and _italic_ (not inside snake_case).
const INLINE = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g

const spanOf = (m: RegExpMatchArray): Inline => {
  if (m[2] !== undefined) return { text: m[2], kind: 'code' }
  if (m[3] !== undefined || m[4] !== undefined) return { text: m[3] ?? m[4] ?? '', kind: 'bold' }
  if (m[5] !== undefined) return { text: m[5], kind: 'link', href: m[6] }
  return { text: m[7] ?? m[8] ?? '', kind: 'italic' }
}

export const parseInline = (text: string): Inline[] => {
  const matches = [...text.matchAll(INLINE)]
  const endOf = (m: RegExpMatchArray | undefined) => (m ? (m.index ?? 0) + m[0].length : 0)
  const plain = (from: number, to?: number): Inline[] => {
    const t = text.slice(from, to)
    return t ? [{ text: t, kind: 'plain' }] : []
  }
  return [...matches.flatMap((m, i) => [...plain(endOf(matches[i - 1]), m.index), spanOf(m)]), ...plain(endOf(matches.at(-1)))]
}

// The reply as blocks. A fence still streaming (no closing line yet) is code to the end.
export const parseBlocks = (md: string): Block[] => {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) blocks.push({ kind: 'para', spans: parseInline(para.join(' ')) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const close = lines.findIndex((l, j) => j > i && FENCE_END.test(l))
      const end = close === -1 ? lines.length : close
      blocks.push({ kind: 'code', lang: (fence[2] ?? '').toLowerCase(), code: lines.slice(i + 1, end).join('\n') })
      i = end
      continue
    }
    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      flush()
      const rest = lines.slice(i + 2).findIndex(l => !l.includes('|') || l.trim() === '')
      const end = rest === -1 ? lines.length : i + 2 + rest
      blocks.push({ kind: 'markdown', text: lines.slice(i, end).join('\n') })
      i = end - 1
      continue
    }
    const heading = HEADING.exec(line)
    const item = ITEM.exec(line)
    const quote = QUOTE.exec(line)
    if (line.trim() === '') flush()
    else if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, spans: parseInline(heading[2] ?? '') })
    } else if (RULE.test(line)) {
      flush()
      blocks.push({ kind: 'rule' })
    } else if (item) {
      flush()
      const marker = item[2] ?? '-'
      blocks.push({ kind: 'item', marker: /\d/.test(marker) ? marker : '•', depth: Math.floor((item[1]?.length ?? 0) / 2), spans: parseInline(item[3] ?? '') })
    } else if (quote) {
      flush()
      blocks.push({ kind: 'quote', spans: parseInline(quote[1] ?? '') })
    } else para.push(line.trim())
  }
  flush()
  return blocks
}
