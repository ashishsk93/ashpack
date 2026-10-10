// Text helpers every Mermaid reader shares: label cleaning and the fence's lines.

export const unquote = (t: string): string => t.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1')

// A label as text: quotes, line breaks, tags, markdown marks and icons out.
export const clean = (t: string): string =>
  unquote(t)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, '&')
    .replace(/\*\*|__|`/g, '')
    .replace(/fa:fa-[\w-]+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

// The fence's lines, indentation kept: no comments, no front matter, no blanks.
export const rawLinesOf = (src: string): string[] =>
  src
    .replace(/^\s*---\n[\s\S]*?\n---\s*\n/, '')
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim() !== '' && !l.trim().startsWith('%%'))

// The same, trimmed.
export const linesOf = (src: string): string[] => rawLinesOf(src).map(l => l.trim())
