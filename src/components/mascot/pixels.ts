// "Loupe", the ReProducer mascot: a pixel-art detective beetle on a 24x24 grid. This is the art data and the SVG building blocks;
// the React component is in Mascot.tsx. Ported from the design's mascot.js (palette, body, poses).

export type Pose = 'idle' | 'investigating' | 'found' | 'failed' | 'waiting' | 'wave';

/** [x, y, colour key] */
type Pt = [number, number, string];

export const PALETTE: Record<string, string> = {
  o: '#2a1263', h: '#5b34b8', s: '#9b74f0', l: '#d0b9ff', d: '#6d42c9', f: '#ff79c6',
  w: '#f7f3ff', p: '#09051c', r: '#ffc857', c: '#7fe3f0', n: '#c98a2b', x: '#7fe3f0',
  t: '#f7f3ff', q: '#d6338f', y: '#ffc857', k: '#6d42c9',
};

// Body in local coordinates (x 0..13, y 0..15). Eyes, lens and arms are layers added by the pose.
const BODY = [
  '..............',
  '...f......f...',
  '....o....o....',
  '....oooooo....',
  '...ohhhhhho...',
  '..ohhhhhhhho..',
  '..ohhhhhhhho..',
  '..ofhhhhhhfo..',
  '.oooooooooooo.',
  'odllssoossssdo',
  'odlsssoosfssdo',
  'odsfssoossssdo',
  'odssssoossssdo',
  '.odsssoosssdo.',
  '..oddsoosddo..',
  '...oooooooo...',
];
const LEGS_A = ['..k..k..k..k..', '.k...k..k...k.'];
const LEGS_B = ['...k.k..k.k...', '...k..k..k.k..'];

export const OX = 5; // the body sits at this offset inside the 24x24 canvas
export const OY = 3;
export const VIEW = 24;

const grid = (rows: string[], y0 = 0, x0 = 0): Pt[] => {
  const pts: Pt[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && ch !== ' ') pts.push([x + x0, y + y0, ch]); }));
  return pts;
};

const eyesOpen: Pt[] = [[4, 5, 'w'], [5, 5, 'w'], [4, 6, 'w'], [8, 5, 'w'], [9, 5, 'w'], [8, 6, 'w']];
const pupils: Pt[] = [[5, 6, 'p'], [9, 6, 'p']];
const lids: Pt[] = [[4, 5, 'h'], [5, 5, 'h'], [4, 6, 'o'], [5, 6, 'o'], [8, 5, 'h'], [9, 5, 'h'], [8, 6, 'o'], [9, 6, 'o']];
const lensSide: Pt[] = [...grid(['.rrr.', 'rcccr', 'rcccr', 'rcccr', '.rrr.'], 4, 14), [15, 9, 'n'], [14, 10, 'n'], [13, 11, 'k'], [14, 11, 'k']];

interface PoseData { eyes: Pt[]; pupils: Pt[]; prop: Pt[]; armA?: Pt[]; armB?: Pt[]; fx?: Pt[] }

export const POSES: Record<Pose, PoseData> = {
  idle: { eyes: eyesOpen, pupils, prop: lensSide },
  wave: {
    eyes: eyesOpen, pupils, prop: lensSide,
    armA: [[0, 8, 'k'], [-1, 7, 'k'], [-1, 6, 'k'], [-2, 5, 'k']],
    armB: [[0, 8, 'k'], [-1, 7, 'k'], [-2, 7, 'k'], [-3, 6, 'k']],
  },
  investigating: {
    eyes: [[4, 5, 'h'], [5, 5, 'h'], [4, 6, 'o'], [5, 6, 'o']], pupils: [],
    prop: [...grid(['..rrrr..', '.rccccr.', 'rccwwccr', 'rcwwppcr', 'rcwwppcr', 'rccwwccr', '.rccccr.', '..rrrr..'], 1, 6), [13, 9, 'n'], [14, 10, 'n'], [13, 11, 'k'], [14, 11, 'k']],
  },
  found: {
    eyes: [[3, 6, 'w'], [4, 5, 'w'], [5, 6, 'w'], [8, 6, 'w'], [9, 5, 'w'], [10, 6, 'w']], pupils: [[6, 7, 'p'], [7, 7, 'f']],
    prop: [...grid(['.rrr.', 'rcccr', 'rcccr', 'rcccr', '.rrr.'], -3, 14), [14, 2, 'n'], [13, 3, 'n'], [13, 4, 'k'], [13, 5, 'k'], [13, 6, 'k'], [0, 8, 'k'], [0, 7, 'k'], [-1, 6, 'k'], [-1, 5, 'k']],
    fx: [[-3, 1, 'y'], [18, 4, 'y'], [-2, -1, 'y'], [19, 0, 'y'], [2, -2, 'y']],
  },
  failed: {
    eyes: [[4, 5, 'o'], [5, 5, 'o'], [4, 6, 'w'], [8, 5, 'o'], [9, 5, 'o'], [8, 6, 'w']], pupils: [[5, 6, 'p'], [9, 6, 'p'], [6, 7, 'p'], [7, 7, 'p']],
    prop: [[-1, 10, 'k'], [-2, 9, 'k'], [-3, 9, 'k'], [14, 10, 'k'], [15, 9, 'k'], [16, 9, 'k'], ...grid(['.rrr.', 'rcccr', '.rrr.'], 15, 15), [14, 16, 'n'], [13, 16, 'n']],
    fx: [[12, 1, 'x'], [12, 2, 'x'], [11, 2, 'x'], [13, 2, 'x']],
  },
  waiting: {
    eyes: eyesOpen, pupils: [[5, 5, 'p'], [9, 5, 'p']],
    prop: [
      ...grid(['ooooooooo', 'ottqqqtto', 'otqtttqto', 'ottttqqto', 'otttqqtto', 'otttqttto', 'ottttttto', 'otttqttto', 'ooooooooo'], -5, 13),
      [17, 4, 'n'], [17, 5, 'n'], [17, 6, 'n'], [17, 7, 'n'], [16, 8, 'n'], [15, 9, 'k'], [14, 10, 'k'], [13, 11, 'k'],
    ],
  },
};

export const LABELS: Record<Pose, string> = {
  idle: 'Mascot, idle',
  wave: 'Mascot waving',
  investigating: 'Mascot looking through its magnifying glass',
  found: 'Mascot celebrating: found it',
  failed: 'Mascot shrugging: could not reproduce',
  waiting: 'Mascot holding a sign: waiting for you',
};

export interface Rect { x: number; y: number; w: number; fill: string; opacity?: number }

/** Merge horizontal runs of the same colour into one rect each (about 3 KB of SVG per pose). */
export function rects(pts: Pt[]): Rect[] {
  const byRow: Record<number, Record<number, string>> = {};
  pts.forEach(([x, y, ch]) => { (byRow[y] ??= {})[x] = ch; });
  const out: Rect[] = [];
  Object.keys(byRow).map(Number).sort((a, b) => a - b).forEach((y) => {
    const row = byRow[y];
    const xs = Object.keys(row).map(Number).sort((a, b) => a - b);
    let i = 0;
    while (i < xs.length) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1 && row[xs[j + 1]] === row[xs[i]]) j++;
      const key = row[xs[i]];
      out.push({ x: xs[i] + OX, y: y + OY, w: j - i + 1, fill: PALETTE[key], ...(key === 'c' ? { opacity: 0.55 } : {}) });
      i = j + 1;
    }
  });
  return out;
}

export const bodyRects = () => rects(grid(BODY));
export const legsARects = () => rects(grid(LEGS_A, 16));
export const legsBRects = () => rects(grid(LEGS_B, 16));
export const lidRects = () => rects(lids);

/** The crop used for the 16-pixel head and shell avatar (renders at exactly 2 screen pixels per art pixel at 32 px). */
export const avatarViewBox = `${OX - 1} ${OY + 1} 16 16`;
export const fullViewBox = `0 0 ${VIEW} ${VIEW}`;

/** A standalone SVG string of one pose without animation, for the favicon. */
export function staticSvg(pose: Pose, avatar: boolean): string {
  const P = POSES[pose];
  const draw = (rs: Rect[]) => rs.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"${r.opacity ? ` fill-opacity="${r.opacity}"` : ''}/>`).join('');
  const bg = avatar ? `<rect x="${OX - 1}" y="${OY + 1}" width="16" height="16" fill="#1d0245"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${avatar ? avatarViewBox : fullViewBox}" shape-rendering="crispEdges">${bg}${draw(legsARects())}${draw(bodyRects())}${draw(rects(P.eyes))}${draw(rects(P.pupils))}${draw(rects(P.prop))}</svg>`;
}
