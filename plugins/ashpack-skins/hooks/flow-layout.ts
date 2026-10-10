// Lays a flowchart out in layers, the way most graph drawings do: each node gets a rank
// (its longest path from a start), an edge that spans ranks passes through a point on each
// rank between, the nodes of a rank are ordered to cross fewer edges, then placed near the
// nodes they join. Pure, and in abstract units: the caller says how big each node is.
// ponytail: plain barycenter ordering and push placement; edges may still cross in dense
// charts. A Brandes–Köpf placement is the upgrade if that ever matters.

export type Size = { w: number; h: number }
export type Point = { x: number; y: number }
export type Layout = { centers: Point[]; routes: Point[][]; width: number; height: number }
export type Gaps = { rank: number; cross: number; margin: number }
export type Dir = 'TD' | 'LR' | 'BT' | 'RL'
type Link = readonly [number, number]

const SWEEPS = 4
const DUMMY = 8 // the room a passing edge takes in a rank

// The edges that close a cycle, depth first in node order: laid out reversed.
const backEdges = (n: number, links: readonly Link[]): Set<number> => {
  const out = Array.from({ length: n }, (_, v) => links.flatMap(([a, b], i) => (a === v && a !== b ? [i] : [])))
  const state = new Array<number>(n).fill(0) // 0 unseen, 1 on the path, 2 done
  const back = new Set<number>()
  const visit = (v: number): void => {
    state[v] = 1
    for (const i of out[v] ?? []) {
      const w = links[i]?.[1] ?? v
      if (state[w] === 1) back.add(i)
      else if (state[w] === 0) visit(w)
    }
    state[v] = 2
  }
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v)
  return back
}

// The links with cycles broken and self loops left out, each with the edge it came from.
const acyclic = (n: number, links: readonly Link[]) => {
  const back = backEdges(n, links)
  return links.flatMap(([a, b], i) => (a === b ? [] : [{ edge: i, from: back.has(i) ? b : a, to: back.has(i) ? a : b, isReversed: back.has(i) }]))
}

// Longest path from a start; then a start is pulled down to just above what it leads to.
export const ranksOf = (n: number, links: readonly Link[]): number[] => {
  const dag = acyclic(n, links)
  const rank = new Array<number>(n).fill(0)
  const indeg = new Array<number>(n).fill(0)
  for (const l of dag) indeg[l.to] = (indeg[l.to] ?? 0) + 1
  const queue = [...rank.keys()].filter(v => indeg[v] === 0)
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q] ?? 0
    for (const l of dag.filter(d => d.from === v)) {
      rank[l.to] = Math.max(rank[l.to] ?? 0, (rank[v] ?? 0) + 1)
      indeg[l.to] = (indeg[l.to] ?? 0) - 1
      if (indeg[l.to] === 0) queue.push(l.to)
    }
  }
  for (const v of [...queue].reverse()) {
    const next = dag.filter(l => l.from === v).map(l => rank[l.to] ?? 0)
    if (next.length > 0 && !dag.some(l => l.to === v)) rank[v] = Math.min(...next) - 1
  }
  const low = Math.min(0, ...rank)
  return rank.map(r => r - low)
}

const mean = (xs: readonly number[]): number | undefined => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined)

export const layoutFlow = (sizes: readonly Size[], links: readonly Link[], dir: Dir, gaps: Gaps): Layout => {
  const n = sizes.length
  const isLR = dir === 'LR' || dir === 'RL'
  const rank = ranksOf(n, links)
  const dag = acyclic(n, links)
  // Vertices: the nodes, then a point per rank an edge passes through.
  const vRank = [...rank]
  const cross = sizes.map(s => (isLR ? s.h : s.w))
  const along = sizes.map(s => (isLR ? s.w : s.h))
  const chains = dag.map(l => {
    const between = Array.from({ length: Math.max(0, (rank[l.to] ?? 0) - (rank[l.from] ?? 0) - 1) }, (_, k) => {
      vRank.push((rank[l.from] ?? 0) + k + 1)
      cross.push(DUMMY)
      along.push(0)
      return vRank.length - 1
    })
    return { ...l, chain: [l.from, ...between, l.to] }
  })
  const segs = chains.flatMap(c => c.chain.slice(1).map((v, i) => [c.chain[i] ?? v, v] as const))
  const preds = vRank.map((_, v) => segs.filter(s => s[1] === v).map(s => s[0]))
  const succs = vRank.map((_, v) => segs.filter(s => s[0] === v).map(s => s[1]))
  const ranks = Math.max(0, ...vRank) + 1
  const layers = Array.from({ length: ranks }, (_, r) => [...vRank.keys()].filter(v => vRank[v] === r))

  // Order: each rank sorted by where its neighbours sit, down then up, a few times.
  const slot = new Map<number, number>()
  const index = () => layers.forEach(l => l.forEach((v, i) => slot.set(v, i)))
  const sorted = (layer: readonly number[], by: readonly number[][]) =>
    [...layer].sort((a, b) => (mean((by[a] ?? []).map(u => slot.get(u) ?? 0)) ?? slot.get(a) ?? 0) - (mean((by[b] ?? []).map(u => slot.get(u) ?? 0)) ?? slot.get(b) ?? 0))
  index()
  for (let s = 0; s < SWEEPS; s++) {
    for (let r = 1; r < ranks; r++) {
      layers[r] = sorted(layers[r] ?? [], preds)
      index()
    }
    for (let r = ranks - 2; r >= 0; r--) {
      layers[r] = sorted(layers[r] ?? [], succs)
      index()
    }
  }

  // Place: each rank packed in order, as near as it can be to what it joins.
  const pos = new Array<number>(vRank.length).fill(0)
  const place = (layer: readonly number[], by: readonly number[][]) => {
    const want = layer.map(v => mean((by[v] ?? []).map(u => pos[u] ?? 0)) ?? pos[v] ?? 0)
    const xs = layer.reduce<number[]>((acc, v, i) => {
      const prev = layer[i - 1]
      const min = prev === undefined ? -Infinity : (acc[i - 1] ?? 0) + ((cross[prev] ?? 0) + (cross[v] ?? 0)) / 2 + gaps.cross
      return [...acc, Math.max(want[i] ?? 0, min)]
    }, [])
    const shift = mean(xs.map((x, i) => (want[i] ?? 0) - x)) ?? 0
    layer.forEach((v, i) => (pos[v] = (xs[i] ?? 0) + shift))
  }
  for (const l of layers) place(l, [])
  for (let s = 0; s < 2; s++) {
    layers.forEach(l => place(l, preds))
    ;[...layers].reverse().forEach(l => place(l, succs))
  }
  layers.forEach(l => place(l, preds))

  const lowCross = Math.min(...vRank.map((_, v) => (pos[v] ?? 0) - (cross[v] ?? 0) / 2))
  const crossAt = (v: number) => (pos[v] ?? 0) - lowCross + gaps.margin
  const crossSpan = Math.max(...vRank.map((_, v) => crossAt(v) + (cross[v] ?? 0) / 2)) + gaps.margin
  const depth = Array.from({ length: ranks }, (_, r) => Math.max(0, ...(layers[r] ?? []).map(v => along[v] ?? 0)))
  const rankAt = depth.map((_, r) => gaps.margin + depth.slice(0, r).reduce((a, d) => a + d + gaps.rank, 0) + (depth[r] ?? 0) / 2)
  const alongSpan = (rankAt.at(-1) ?? 0) + (depth.at(-1) ?? 0) / 2 + gaps.margin

  // Into x and y: down the page, or across it; BT and RL mirrored.
  const width = isLR ? alongSpan : crossSpan
  const height = isLR ? crossSpan : alongSpan
  const at = (a: number, c: number): Point => {
    const p = isLR ? { x: a, y: c } : { x: c, y: a }
    return dir === 'BT' ? { x: p.x, y: height - p.y } : dir === 'RL' ? { x: width - p.x, y: p.y } : p
  }
  const centers = sizes.map((_, v) => at(rankAt[rank[v] ?? 0] ?? 0, crossAt(v)))
  const routes = links.map(() => [] as Point[])
  for (const c of chains) {
    const points = c.chain.map((v, i) => {
      const a = rankAt[vRank[v] ?? 0] ?? 0
      const edge = i === 0 ? (along[v] ?? 0) / 2 : i === c.chain.length - 1 ? -(along[v] ?? 0) / 2 : 0
      return at(a + edge, crossAt(v))
    })
    routes[c.edge] = c.isReversed ? [...points].reverse() : points
  }
  return { centers, routes, width, height }
}
