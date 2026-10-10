// Text helpers every Mermaid reader shares: label cleaning, the fence's lines, its title, and
// the caps past which a fence stays code.

// A chart past these draws too small to read, and building it (a cross product of `&` groups,
// a layout hundreds of ranks deep) would stall the reply: the fence stays code instead.
export const MAX_NODES = 200
export const MAX_ITEMS = 400 // edges, messages, slices, points, tasks, events, members

export const unquote = (t: string): string => t.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1')

// `&lt;`, `&#9829;` and Mermaid's own `#lt;`, `#9829;` as the characters they stand for, in one
// pass, so `&amp;lt;` stays `&lt;`. A control character or a lone surrogate stays as written.
const ENTITY = /&(?:(amp|lt|gt|quot|apos|nbsp)|#(\d{1,7})|#x([\da-f]{1,6}));|#(amp|lt|gt|quot|apos|nbsp|\d{1,7});/gi
const NAMED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const isPrintable = (code: number): boolean => code >= 0x20 && code <= 0x10ffff && !(code >= 0x7f && code < 0xa0) && !(code >= 0xd800 && code <= 0xdfff)
const decode = (t: string): string =>
  t.replace(ENTITY, (all, name?: string, dec?: string, hex?: string, hash?: string) => {
    const word = (name ?? hash ?? '').toLowerCase()
    if (NAMED[word]) return NAMED[word]
    const code = hex ? parseInt(hex, 16) : Number(dec ?? hash)
    return isPrintable(code) ? String.fromCodePoint(code) : all
  })

// A label as text: quotes, line breaks, tags, markdown marks and icons out; entities decoded
// after the tags go, so `&lt;b&gt;` shows as written.
export const clean = (t: string): string =>
  decode(
    unquote(t)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?[a-z][^>]*>/gi, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/fa:fa-[\w-]+\s*/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()

const FRONT = /^\s*---\n([\s\S]*?)\n---\s*\n/

// The front matter's `title:`, which Mermaid draws over any kind of chart.
export const frontTitle = (src: string): string => clean(/^title:\s*(.*)$/m.exec(FRONT.exec(src)?.[1] ?? '')?.[1] ?? '')

// `A --> B %% why`: the comment off, unless its `%%` sits inside a quoted label.
const uncomment = (l: string): string => {
  const at = l.search(/\s%%(?!\{)/)
  return at > 0 && l.slice(0, at).split('"').length % 2 === 1 ? l.slice(0, at) : l
}

// The fence's lines, indentation kept: no comments, no front matter, no blanks. Runs of spaces
// after the indent are one space, so no reader's pattern backtracks across a long run.
export const rawLinesOf = (src: string): string[] =>
  src
    .replace(FRONT, '')
    .split('\n')
    .map(l => uncomment(l.trimEnd().replace(/(?<=\S)[ \t]+/g, ' ')))
    .filter(l => l.trim() !== '' && !l.trim().startsWith('%%'))

// The same, trimmed.
export const linesOf = (src: string): string[] => rawLinesOf(src).map(l => l.trim())
