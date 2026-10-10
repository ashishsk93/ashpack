import type { Kind } from './skins'

// Small line icons the desktop app draws as images, one per kind of tool call. A running
// call's ring turns by CSS inside the SVG, which plays in the image.

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
