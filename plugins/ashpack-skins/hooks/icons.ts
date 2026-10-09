import type { Kind } from './skins'

// Small line icons the desktop app draws as images, one per kind of tool call, and the
// turn's loader. Animation is CSS or SMIL inside the SVG, which plays in the image.

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

// ── the turn's loader: a row of bars that rise and fall in turn, a wave moving right ──

const LEVELS = '▁▂▃▄▅▆▇█'

// The terminal's wave at `frame`: `width` cells, each a bar.
export const wave = (frame: number, width: number): string =>
  Array.from({ length: width }, (_, i) => LEVELS[Math.round(((Math.sin(i * 0.8 - frame * 0.45) + 1) / 2) * 7)]).join('')

const BAR_PX = 4
const BAR_GAP_PX = 3
const WAVE_H = 12 // px
const WAVE_S = 0.9

// The desktop's wave: an SVG that animates itself (SMIL), each bar a beat behind the one before.
export const waveSvg = (color: string, width: number): string => {
  const bars = Math.max(3, Math.floor((width + BAR_GAP_PX) / (BAR_PX + BAR_GAP_PX)))
  const w = bars * (BAR_PX + BAR_GAP_PX) - BAR_GAP_PX
  const low = WAVE_H / 4
  const rects = Array.from({ length: bars }, (_, i) => {
    const begin = `begin="${(-i * 0.1).toFixed(1)}s"`
    return (
      `<rect x="${i * (BAR_PX + BAR_GAP_PX)}" width="${BAR_PX}" rx="${BAR_PX / 2}" fill="${color}">` +
      `<animate attributeName="height" values="${low};${WAVE_H};${low}" dur="${WAVE_S}s" ${begin} repeatCount="indefinite"/>` +
      `<animate attributeName="y" values="${(WAVE_H - low) / 2};0;${(WAVE_H - low) / 2}" dur="${WAVE_S}s" ${begin} repeatCount="indefinite"/>` +
      `</rect>`
    )
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${WAVE_H}" width="${w}" height="${WAVE_H}">${rects}</svg>`
}
