'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Mascot from './mascot/Mascot';

type Kind = 'peek' | 'walk' | 'wave' | 'chase';

// Sponsor logos in public/sponsors: shown height in px, width from each file's aspect ratio.
const SPONSORS = [
  { name: 'Google DeepMind', src: '/sponsors/google-deepmind.svg', h: 15, ratio: 67.65 / 9 },
  { name: 'MongoDB', src: '/sponsors/mongodb.png', h: 22, ratio: 2204 / 556 },
  { name: 'Encode Club', src: '/sponsors/encode-club.png', h: 30, ratio: 1102 / 582 },
  { name: 'Arc', src: '/sponsors/arc.png', h: 26, ratio: 336 / 343 },
  { name: 'Saint.work', src: '/sponsors/saint-work.png', h: 22, ratio: 893 / 198 },
  { name: 'treg', src: '/sponsors/treg.png', h: 20, ratio: 1001 / 280 },
].map((s) => ({ ...s, w: Math.round(s.h * s.ratio) }));

const SIZE = 64;
const BUG = (
  <svg viewBox="0 0 6 4" width="100%" height="100%" shapeRendering="crispEdges" aria-hidden="true">
    <rect x="1" y="0" width="4" height="3" fill="#ff79c6" />
    <rect x="0" y="1" width="1" height="1" fill="#2a1263" />
    <rect x="1" y="3" width="1" height="1" fill="#2a1263" />
    <rect x="4" y="3" width="1" height="1" fill="#2a1263" />
    <rect x="2" y="1" width="1" height="1" fill="#2a1263" />
  </svg>
);

/**
 * One wandering moment of the mascot inside the footer: peeks in from the edge, walks across, pops up and waves, or (rarely) chases a bug.
 * It only ever uses the footer, never content that is being read, and it moves in whole-pixel steps.
 */
function Moment({ kind, stage, onDone }: { kind: Kind; stage: React.RefObject<HTMLDivElement | null>; onDone: () => void }) {
  const mascot = useRef<HTMLDivElement>(null);
  const bug = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = stage.current;
    const m = mascot.current;
    if (!host || !m) return;
    const W = host.clientWidth;
    const H = host.clientHeight;
    const s = SIZE;
    const run: Animation[] = [];
    const at = (el: HTMLElement, left: number, top: number) => { el.style.left = `${left}px`; el.style.top = `${top}px`; };
    if (kind === 'peek') {
      at(m, W - s * 0.55, H * 0.45);
      run.push(m.animate([{ transform: `translateX(${s}px)` }, { transform: 'translateX(0)', offset: 0.25 }, { transform: 'translateX(0)', offset: 0.8 }, { transform: `translateX(${s}px)` }], { duration: 1900, easing: 'steps(12,end)' }));
    } else if (kind === 'walk') {
      at(m, 0, H - s);
      run.push(m.animate([{ transform: `translateX(${-s}px)` }, { transform: `translateX(${W}px)` }], { duration: Math.max(4000, W * 9), easing: 'steps(40,end)' }));
    } else if (kind === 'wave') {
      at(m, W / 2 - s / 2, H - s);
      run.push(m.animate([{ transform: `translateY(${s * 0.6}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1, offset: 0.15 }, { transform: 'translateY(0)', opacity: 1, offset: 0.85 }, { transform: `translateY(${s * 0.6}px)`, opacity: 0 }], { duration: 2000, easing: 'steps(14,end)' }));
    } else {
      const b = bug.current;
      if (!b) return;
      at(b, 0, H - s * 0.25);
      at(m, 0, H - s);
      const d = Math.max(2600, W * 4.5);
      run.push(b.animate([{ transform: `translateX(${-s * 0.3}px)` }, { transform: `translateX(${W * 0.4}px) translateY(-2px)`, offset: 0.35 }, { transform: `translateX(${W * 0.55}px)`, offset: 0.5 }, { transform: `translateX(${W + s}px)` }], { duration: d, easing: 'steps(36,end)' }));
      run.push(m.animate([{ transform: `translateX(${-s * 1.6}px)` }, { transform: `translateX(${W}px)` }], { duration: d * 1.1, easing: 'steps(40,end)' }));
    }
    let alive = true;
    Promise.all(run.map((a) => a.finished)).then(() => alive && onDone()).catch(() => undefined);
    return () => { alive = false; run.forEach((a) => a.cancel()); };
  }, [kind, stage, onDone]);

  const pose = kind === 'wave' ? 'wave' : kind === 'chase' ? 'investigating' : 'idle';
  return (
    <>
      {kind === 'chase' && <div ref={bug} className="rpm-wander pointer-events-none absolute z-[5]" style={{ width: SIZE * 0.3, height: SIZE * 0.2 }}>{BUG}</div>}
      <div ref={mascot} className="rpm-wander pointer-events-none absolute z-[5]" style={{ width: SIZE, height: SIZE }}>
        <Mascot pose={pose} size={SIZE} walking={kind === 'walk' || kind === 'chase'} label="" />
      </div>
    </>
  );
}

export default function SiteFooter() {
  const pathname = usePathname();
  const stage = useRef<HTMLDivElement>(null);
  const [moment, setMoment] = useState<{ kind: Kind; id: number } | null>(null);
  // Never while an investigation page is open: it is busy, and the pose there follows the run.
  const allowed = !pathname.startsWith('/runs');

  // Pause every animation while the tab is hidden.
  useEffect(() => {
    const toggle = () => document.documentElement.classList.toggle('rpm-paused', document.hidden);
    document.addEventListener('visibilitychange', toggle);
    return () => document.removeEventListener('visibilitychange', toggle);
  }, []);

  // A moment every 20 to 40 s, at random. Off on phone width, for reduced motion, and while the tab is hidden.
  useEffect(() => {
    if (!allowed) return;
    let timer: ReturnType<typeof setTimeout>;
    let n = 0;
    const kinds: Kind[] = ['peek', 'walk', 'wave', 'peek', 'walk', 'chase'];
    const tick = () => {
      timer = setTimeout(() => {
        const calm = document.hidden || window.innerWidth < 640 || matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!calm) setMoment({ kind: kinds[Math.floor(Math.random() * (Math.random() < 0.05 ? 6 : 5))], id: ++n });
        tick();
      }, 20_000 + Math.random() * 20_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [allowed]);

  return (
    <footer className="mt-auto border-t border-purple-800">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-4 px-4 pt-6 sm:px-8">
        <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-subtle uppercase">Encode London 2026 sponsors</span>
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-8 gap-y-4 p-0">
          {SPONSORS.map((s) => (
            <li key={s.src}>
              {/* The logos are dark artwork: shown white on the dark footer, brighter on hover. */}
              <Image src={s.src} alt={s.name} width={s.w} height={s.h} unoptimized className="w-auto opacity-60 brightness-0 invert transition-opacity hover:opacity-100" style={{ height: s.h }} />
            </li>
          ))}
        </ul>
      </div>
      <div ref={stage} className="relative mx-auto h-24 max-w-[1120px] overflow-hidden px-4 sm:px-8">
        <p className="pt-4 font-mono text-xs text-faint">ReProducer · bugs you cannot reproduce, reproduced.</p>
        {moment && <Moment key={moment.id} kind={moment.kind} stage={stage} onDone={() => setMoment(null)} />}
      </div>
    </footer>
  );
}
