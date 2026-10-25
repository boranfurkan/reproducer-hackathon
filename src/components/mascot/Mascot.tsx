'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LABELS, POSES, avatarViewBox, bodyRects, fullViewBox, legsARects, legsBRects, lidRects, rects, type Pose, type Rect } from './pixels';

const draw = (rs: Rect[]) => rs.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} {...(r.opacity ? { fillOpacity: r.opacity } : {})} />);

// The art never changes, so the rect lists are built once.
const BODY = bodyRects();
const LEGS_A = legsARects();
const LEGS_B = legsBRects();
const LIDS = lidRects();
const POSE_RECTS = Object.fromEntries(
  (Object.keys(POSES) as Pose[]).map((k) => [k, { eyes: rects(POSES[k].eyes), pupils: rects(POSES[k].pupils), prop: rects(POSES[k].prop), armA: rects(POSES[k].armA ?? []), armB: rects(POSES[k].armB ?? []), fx: rects(POSES[k].fx ?? []) }]),
) as Record<Pose, { eyes: Rect[]; pupils: Rect[]; prop: Rect[]; armA: Rect[]; armB: Rect[]; fx: Rect[] }>;

interface Props {
  pose?: Pose;
  /** Pixels, or any CSS length ("min(280px,60cqw)"). */
  size?: number | string;
  /** The 16-pixel head and shell crop in a rounded tile: the agent's avatar on the timeline (32 px), the favicon (16 px). */
  avatar?: boolean;
  walking?: boolean;
  /** Hold the pose without moving (a finished step on the timeline). */
  still?: boolean;
  /** Accessible name; defaults to a description of the pose. Pass '' to hide it from screen readers (decorative use). */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Loupe, the mascot. Hover: the pupils follow the cursor. Click: a short jump. Both are off for people who prefer reduced motion (CSS),
 * and every animation is whole-pixel steps. The pose follows what the agent is doing (see the run page).
 */
export default function Mascot({ pose = 'idle', size = avatarDefault(), avatar = false, walking = false, still = false, label, className = '', style }: Props) {
  const pupilsRef = useRef<SVGGElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [jumping, setJumping] = useState(false);
  const jumpTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const move = useRef<((e: PointerEvent) => void) | null>(null);

  useEffect(() => () => { clearTimeout(jumpTimer.current); if (move.current) window.removeEventListener('pointermove', move.current); }, []);

  const onClick = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setJumping(false);
    requestAnimationFrame(() => {
      setJumping(true);
      clearTimeout(jumpTimer.current);
      jumpTimer.current = setTimeout(() => setJumping(false), 520);
    });
  };
  const onEnter = () => {
    move.current = (e: PointerEvent) => {
      const host = hostRef.current;
      const p = pupilsRef.current;
      if (!host || !p) return;
      const b = host.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height * 0.35;
      const dx = e.clientX < cx - b.width * 0.15 ? -1 : 0;
      const dy = e.clientY < cy - b.height * 0.1 ? -1 : 0;
      p.style.transform = `translate(${dx}px,${dy}px)`;
    };
    window.addEventListener('pointermove', move.current);
  };
  const onLeave = () => {
    if (move.current) window.removeEventListener('pointermove', move.current);
    move.current = null;
    if (pupilsRef.current) pupilsRef.current.style.transform = '';
  };

  const R = POSE_RECTS[pose];
  const dim = typeof size === 'number' ? `${size}px` : size;
  const decorative = label === '';
  return (
    <span
      ref={hostRef}
      className={`rpm ${avatar ? 'rpm-avatar' : ''} ${still ? 'rpm-still' : ''} ${className}`}
      style={{ width: dim, height: dim, ...style }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label ?? LABELS[pose] })}
      onClick={onClick}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <svg viewBox={avatar ? avatarViewBox : fullViewBox} width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <g className={`rpm-root rpm-${pose} ${walking ? 'rpm-walking' : ''} ${jumping ? 'rpm-jump' : ''}`}>
          <g className="rpm-shadow"><rect x={6} y={21} width={12} height={1} fill="#000" fillOpacity={0.35} /></g>
          <g className="rpm-body">
            <g className="rpm-legs-a">{draw(LEGS_A)}</g>
            {walking && <g className="rpm-legs-b">{draw(LEGS_B)}</g>}
            {draw(BODY)}
            <g className="rpm-eyes">{draw(R.eyes)}</g>
            <g className="rpm-pupils" ref={pupilsRef}>{draw(R.pupils)}</g>
            {(pose === 'idle' || pose === 'wave' || pose === 'waiting') && <g className="rpm-lids">{draw(LIDS)}</g>}
            <g className="rpm-prop">{draw(R.prop)}</g>
            {R.armA.length > 0 && (
              <>
                <g className="rpm-arm-a">{draw(R.armA)}</g>
                <g className="rpm-arm-b">{draw(R.armB)}</g>
              </>
            )}
          </g>
          {R.fx.length > 0 && <g className="rpm-fx">{draw(R.fx)}</g>}
        </g>
      </svg>
    </span>
  );
}

function avatarDefault(): number {
  return 96;
}
