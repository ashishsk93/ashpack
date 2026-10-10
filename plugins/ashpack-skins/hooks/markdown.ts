// A small markdown reader for skinned replies: blocks, and inline spans to color. A table
// comes out whole, as its lines, for the table card and grid to read.

// Bold and italic are marks on a span, so `**`code`**` stays code, in bold.
export type Inline = { text: string; kind: 'plain' | 'code' | 'link'; href?: string; bold?: true; italic?: true }

export type Block =
  | { kind: 'heading'; level: number; spans: Inline[] }
  | { kind: 'para'; spans: Inline[] }
  | { kind: 'item'; marker: string; depth: number; spans: Inline[]; check?: boolean } // check: a task item, done or not
  | { kind: 'quote'; lines: Inline[][] } // its paragraphs, a row each
  | { kind: 'alert'; type: AlertType; lines: Inline[][] }
  | { kind: 'code'; lang: string; code: string; isClosed: boolean }
  | { kind: 'rule' }
  | { kind: 'table'; text: string }

export type AlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution'

const ALERT = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i
const TASK = /^\[([ xX])\]\s+(.*)$/

// A fence opens with its indent, then three or more backticks (whose info holds no
// backtick) or tildes; its language is the info's first word.
const FENCE = /^(\s*)(?:(`{3,})([^`]*)|(~{3,})(.*))$/
const HEADING = /^(#{1,6})\s+(.*)$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

// Code ticks, **bold**, __bold__, [links](url), *italic* and _italic_ (not inside snake_case).
const INLINE = /(`+)([^`]+?)\1|\*\*(.+?)\*\*|__([^_]+?)__|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<!\w)_([^_\s][^_]*?)_(?!\w)/g

const spansOf = (m: RegExpMatchArray): Inline[] => {
  if (m[2] !== undefined) return [{ text: m[2], kind: 'code' }]
  // A link draws its label as one run of text, the label's own marks off.
  if (m[5] !== undefined) return [{ text: parseInline(m[5]).map(s => s.text).join(''), kind: 'link', href: m[6] }]
  const bold = m[3] ?? m[4]
  if (bold !== undefined) return parseInline(bold).map((s): Inline => ({ ...s, bold: true }))
  return parseInline(m[7] ?? m[8] ?? '').map((s): Inline => ({ ...s, italic: true }))
}

export const parseInline = (text: string): Inline[] => {
  const matches = [...text.matchAll(INLINE)]
  const endOf = (m: RegExpMatchArray | undefined) => (m ? (m.index ?? 0) + m[0].length : 0)
  const plain = (from: number, to?: number): Inline[] => {
    const t = text.slice(from, to)
    return t ? [{ text: t, kind: 'plain' }] : []
  }
  return [...matches.flatMap((m, i) => [...plain(endOf(matches[i - 1]), m.index), ...spansOf(m)]), ...plain(endOf(matches.at(-1)))]
}

// A fenced block from line `i`: its language, its lines less the opener's indent, and the
// line after it. It closes on a run of the same mark at least as long; a fence still
// streaming (no closing line yet) is code to the end.
const fenced = (lines: readonly string[], i: number, f: RegExpExecArray) => {
  const [, indent = '', ticks, tickInfo, tildes, tildeInfo] = f
  const run = ticks ?? tildes ?? '```'
  const closer = new RegExp(`^\\s*${run[0]}{${run.length},}\\s*$`)
  const unindent = new RegExp(`^[ \\t]{0,${indent.length}}`)
  const close = lines.findIndex((l, j) => j > i && closer.test(l))
  const end = close === -1 ? lines.length : close
  const lang = /^[\w+#.-]*/.exec((tickInfo ?? tildeInfo ?? '').trim())?.[0] ?? ''
  const block: Block = { kind: 'code', lang: lang.toLowerCase(), code: lines.slice(i + 1, end).map(l => l.replace(unindent, '')).join('\n'), isClosed: close !== -1 }
  return { block, next: end + 1 }
}

// A run of `>` lines from line `i`: an alert when it opens with `[!NOTE]` and the like, its
// lines as they are; else a quote, its lines joined into paragraphs as markdown reads them.
const quoted = (lines: readonly string[], i: number) => {
  const rest = lines.slice(i + 1).findIndex(l => !QUOTE.test(l))
  const end = rest === -1 ? lines.length : i + 1 + rest
  const body = lines.slice(i, end).map(l => QUOTE.exec(l)?.[1] ?? '')
  const alert = ALERT.exec(body[0] ?? '')
  const block: Block = alert
    ? {
        kind: 'alert',
        type: (alert[1] ?? 'note').toLowerCase() as AlertType,
        lines: [alert[2] ?? '', ...body.slice(1)].filter(l => l.trim() !== '').map(parseInline),
      }
    : {
        kind: 'quote',
        lines: body
          .join('\n')
          .split(/\n\s*\n/)
          .map(para => para.split('\n').map(l => l.trim()).join(' ').trim())
          .filter(para => para !== '')
          .map(parseInline),
      }
  return { block, next: end }
}

// The paragraph or list item still taking lines: its spans are read once it closes.
type Open = { lines: string[]; isItem: boolean; close: (spans: Inline[]) => Block }

// The reply as blocks.
export const parseBlocks = (md: string): Block[] => {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let open: Open | null = null
  const flush = () => {
    if (open) blocks.push(open.close(parseInline(open.lines.join(' '))))
    open = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const { block, next } = fenced(lines, i, fence)
      blocks.push(block)
      i = next - 1
      continue
    }
    if (line.includes('|') && TABLE_SEP.test(lines[i + 1] ?? '')) {
      flush()
      const rest = lines.slice(i + 2).findIndex(l => !l.includes('|') || l.trim() === '')
      const end = rest === -1 ? lines.length : i + 2 + rest
      blocks.push({ kind: 'table', text: lines.slice(i, end).join('\n') })
      i = end - 1
      continue
    }
    const heading = HEADING.exec(line)
    const item = ITEM.exec(line)
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
      const task = TASK.exec(item[3] ?? '')
      const depth = Math.floor((item[1]?.length ?? 0) / 2)
      open = {
        lines: [task ? (task[2] ?? '') : (item[3] ?? '')],
        isItem: true,
        close: spans => ({ kind: 'item', marker: /\d/.test(marker) ? marker : '•', depth, spans, ...(task ? { check: task[1] !== ' ' } : {}) }),
      }
    } else if (QUOTE.test(line)) {
      flush()
      const { block, next } = quoted(lines, i)
      blocks.push(block)
      i = next - 1
    } else if (open !== null && (!open.isItem || /^\s/.test(line))) {
      // A paragraph takes the next line; a list item takes an indented one.
      open.lines.push(line.trim())
    } else {
      flush()
      open = { lines: [line.trim()], isItem: false, close: spans => ({ kind: 'para', spans }) }
    }
  }
  flush()
  return blocks
}
