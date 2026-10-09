import type { Kind } from './skins'

// Small line icons the desktop app draws as images: one per kind of tool call, and one
// for each phase of a turn. Animation is CSS inside the SVG, which plays in the image.

// Strokes on a 24-unit grid.
const SHAPES: Readonly<Record<Kind, string>> = {
  read: '<rect x="5.5" y="3" width="13" height="18" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
  write: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  run: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 10l3 2.5L7 15M12.5 15.5H17"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>',
  web: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16"/><ellipse cx="12" cy="12" rx="3.6" ry="8"/>',
  mcp: '<path d="M8.5 3.5v4M15.5 3.5v4"/><path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.5v4"/>',
}

const TURN = '.t{transform-box:view-box;transform-origin:12px 12px;animation:t 1s linear infinite}@keyframes t{to{transform:rotate(360deg)}}'

const svg = (size: number, style: string, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${style ? `<style>${style}</style>` : ''}${body}</svg>`

const strokes = (color: string, body: string) =>
  `<g fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</g>`

// A tool call's icon; while it runs, the shape shrinks inside a turning ring.
export const toolIcon = (kind: Kind, color: string, isRunning: boolean): string =>
  isRunning
    ? svg(16, TURN, `<g transform="translate(6 6) scale(.5)">${strokes(color, SHAPES[kind])}</g><circle class="t" cx="12" cy="12" r="10" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="16 47"/>`)
    : svg(16, '', strokes(color, SHAPES[kind]))

export type Phase = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

// What the turn is doing, as a moving mark: a slow pulse while it thinks, a turning ring
// while a tool runs, three rising bars while it writes, three blinking dots otherwise.
export const phaseIcon = (phase: Phase, color: string): string => {
  if (phase === 'thinking') {
    return svg(
      18,
      '.p{transform-box:view-box;transform-origin:12px 12px;animation:p 1.4s ease-in-out infinite}@keyframes p{0%,100%{transform:scale(.6);opacity:.5}50%{transform:scale(1);opacity:1}}',
      `<circle class="p" cx="12" cy="12" r="6" fill="${color}"/>`,
    )
  }
  if (phase === 'tool-use') {
    return svg(18, TURN, `<circle cx="12" cy="12" r="8" fill="none" stroke="${color}" stroke-opacity=".2" stroke-width="2.2"/><circle class="t" cx="12" cy="12" r="8" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="12 38"/>`)
  }
  if (phase === 'responding') {
    return svg(
      18,
      '.b{transform-box:fill-box;transform-origin:center bottom;animation:b .8s ease-in-out infinite}.b2{animation-delay:.12s}.b3{animation-delay:.24s}@keyframes b{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}',
      [6, 11, 16].map((x, i) => `<rect class="b b${i + 1}" x="${x}" y="6" width="2.6" height="12" rx="1.3" fill="${color}"/>`).join(''),
    )
  }
  return svg(
    18,
    '.d{animation:d 1.2s ease-in-out infinite}.d2{animation-delay:.2s}.d3{animation-delay:.4s}@keyframes d{0%,100%{opacity:.25}40%{opacity:1}}',
    [6.5, 12, 17.5].map((x, i) => `<circle class="d d${i + 1}" cx="${x}" cy="12" r="2" fill="${color}"/>`).join(''),
  )
}
