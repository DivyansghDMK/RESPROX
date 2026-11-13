// src/components/BreathingLungs.jsx
//
// Shown on the therapy card while therapy runs: anatomical lungs that breathe
// once every 4 s (15 a minute). Air bubbles travel down the trachea into the
// bronchi on each inhale, and small oxygen bubbles light up inside the lungs.
// Lungs are pink, air is blue. Decorative only, so hidden from screen readers;
// with reduced motion the lungs stay still and no bubbles move.

import React, { useEffect, useId, useState } from 'react';

const RIGHT = 'M 88 66 C 84 44, 74 28, 63 29 C 45 30, 30 58, 24 92 C 18 124, 18 150, 34 158 C 50 166, 72 162, 86 152 C 92 140, 90 110, 92 92 C 93 80, 91 72, 88 66 Z';
// The left lung has the cardiac notch on its lower inner edge.
const LEFT = 'M 112 66 C 116 44, 126 28, 137 29 C 155 30, 170 58, 176 92 C 182 124, 182 150, 166 158 C 152 165, 136 163, 124 156 C 129 147, 127 135, 117 129 C 110 121, 109 101, 109 90 C 109 80, 109 72, 112 66 Z';

/** Bronchial tree on one side; side -1 draws the screen-left lung, +1 the screen-right. */
function bronchi(side) {
  const x = (v) => 100 + side * (100 - v);
  return [
    `M100 64 C ${x(94)} 70, ${x(86)} 76, ${x(80)} 84`,
    `M${x(80)} 84 C ${x(72)} 74, ${x(68)} 62, ${x(64)} 50`,
    `M${x(80)} 84 C ${x(68)} 92, ${x(56)} 100, ${x(42)} 112`,
    `M${x(80)} 84 C ${x(76)} 104, ${x(70)} 122, ${x(62)} 142`,
    `M${x(66)} 58 C ${x(60)} 56, ${x(54)} 56, ${x(48)} 60`,
    `M${x(56)} 104 C ${x(52)} 116, ${x(46)} 126, ${x(38)} 134`,
    `M${x(70)} 120 C ${x(62)} 126, ${x(54)} 136, ${x(50)} 148`,
    `M${x(73)} 112 C ${x(80)} 124, ${x(82)} 136, ${x(80)} 148`,
  ].join(' ');
}
const TREE = `${bronchi(-1)} ${bronchi(1)}`;
const FISSURES = 'M 30 98 C 50 96, 70 100, 90 104 M 82 58 C 66 90, 48 122, 36 154 M 118 58 C 134 90, 152 122, 164 154';
const TRACHEA = 'M94 4 h12 v56 c 0 4, 6 8, 14 14 l -4 6 c -8 -6, -14 -10, -16 -12 c -2 2, -8 6, -16 12 l -4 -6 c 8 -6, 14 -10, 14 -14 z';
const RINGS = 'M95 12 h10 M95 20 h10 M95 28 h10 M95 36 h10 M95 44 h10 M95 52 h10';

// Down the trachea, then out along a bronchus. [path, start offset in s]
const AIR_PATHS = [
  ['M100 2 L100 64 C 92 72, 84 78, 78 86 C 66 96, 54 106, 46 116', 0],
  ['M100 2 L100 64 C 108 72, 116 78, 122 86 C 134 96, 146 106, 154 116', 0.12],
  ['M100 2 L100 64 C 92 72, 82 84, 74 104 C 70 118, 66 130, 62 142', 0.25],
  ['M100 2 L100 64 C 108 72, 118 84, 126 104 C 130 118, 134 130, 138 142', 0.38],
  ['M100 2 L100 64 C 94 70, 76 64, 66 52', 0.45],
  ['M100 2 L100 64 C 106 70, 124 64, 134 52', 0.2],
];
// Oxygen bubbles inside the lungs: [cx, cy, r]
const ALVEOLI = [
  [48, 96, 4], [38, 118, 3.4], [58, 128, 4.2], [44, 140, 3], [66, 104, 3], [60, 70, 3.2], [52, 150, 3.6], [30, 100, 2.8],
  [152, 96, 4], [162, 118, 3.4], [142, 124, 3.2], [156, 140, 3], [134, 104, 3], [140, 70, 3.2], [164, 96, 2.8], [150, 150, 3.4],
];
const RISING = [[56, 60], [146, 60], [40, 90], [160, 90]];

function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function BreathingLungs({ label = 'Breathing with support' }) {
  // Unique ids: two copies on a page must not share gradients or clip paths.
  const id = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const ref = (name) => `url(#${id}${name})`;

  return (
    <div className="lungs-art" aria-hidden="true">
      <svg viewBox="0 0 200 175">
        <defs>
          <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fecdd3" /><stop offset=".55" stopColor="#fda4af" /><stop offset="1" stopColor="#f4899b" />
          </linearGradient>
          <radialGradient id={`${id}s`} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}b`} cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".35" stopColor="#bae6fd" /><stop offset="1" stopColor="#0ea5e9" stopOpacity=".85" />
          </radialGradient>
          <radialGradient id={`${id}o`} cx=".5" cy=".55" r=".6">
            <stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}c`}><path d={RIGHT} /><path d={LEFT} /></clipPath>
        </defs>

        <ellipse className="lungs-halo" cx="100" cy="100" rx="94" ry="74" fill="none" stroke="#7dd3fc" strokeWidth="2" />
        <g className="lungs-body">
          <path d={RIGHT} fill={ref('t')} />
          <path d={LEFT} fill={ref('t')} />
          <g clipPath={ref('c')}>
            <rect className="lungs-o2" x="0" y="20" width="200" height="150" fill={ref('o')} />
            <path d={TREE} fill="none" stroke="#fff1f2" strokeWidth="2.2" strokeLinecap="round" opacity=".9" />
            <path d={FISSURES} fill="none" stroke="#e0607e" strokeWidth="1.2" opacity=".45" />
            {ALVEOLI.map(([cx, cy, r], i) => (
              <circle key={i} className="lungs-alv" cx={cx} cy={cy} r={r} fill={ref('b')} style={{ animationDelay: `${(i % 5) * 0.08}s` }} />
            ))}
            {!reduced && RISING.map(([cx, cy], i) => (
              <circle key={i} className="lungs-rise" cx={cx} cy={cy} r="2.2" fill="#e0f2fe" stroke="#7dd3fc" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
            <path d={RIGHT} fill={ref('s')} />
            <path d={LEFT} fill={ref('s')} />
          </g>
          <path d={RIGHT} fill="none" stroke="#d9546f" strokeWidth="1.8" />
          <path d={LEFT} fill="none" stroke="#d9546f" strokeWidth="1.8" />
          <path d={TRACHEA} fill="#fbcfe8" stroke="#d9546f" strokeWidth="1.6" strokeLinejoin="round" />
          <path d={RINGS} stroke="#e48aa3" strokeWidth="2" strokeLinecap="round" />
          {!reduced && AIR_PATHS.map(([path, start], i) => (
            <circle key={i} r={i % 2 ? 3.6 : 4.4} fill={ref('b')} opacity="0">
              {/* inhale is the first 36 % of the breath; the bubble then fades */}
              <animateMotion dur="4s" repeatCount="indefinite" begin={`${start}s`} path={path} keyPoints="0;1;1" keyTimes="0;0.36;1" calcMode="linear" />
              <animate attributeName="opacity" dur="4s" repeatCount="indefinite" begin={`${start}s`} values="0;1;0.9;0;0" keyTimes="0;0.06;0.36;0.46;1" />
            </circle>
          ))}
        </g>
      </svg>
      <span className="lungs-label"><span className="lungs-dot" />{label}</span>
    </div>
  );
}
