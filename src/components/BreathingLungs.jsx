// src/components/BreathingLungs.jsx
//
// Shown on the therapy card: anatomical lungs inside a ring of pulse bars.
//   running   the lungs breathe once every 4 s (15 a minute) and the ring
//             pulses outward on each inhale
//   starting  pale lungs; light sweeps round the ring while the device confirms
//   stopping  the lungs empty and the ring dims
// Decorative only, so hidden from screen readers; still for reduced motion.

import React, { useId } from 'react';

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

const RAYS = 48;
const rayAngles = Array.from({ length: RAYS }, (_, i) => (i * 360) / RAYS);

export default function BreathingLungs({ mode = 'running' }) {
  // Unique ids: two copies on a page must not share gradients or clip paths.
  const id = useId().replace(/:/g, '');
  const ref = (name) => `url(#${id}${name})`;

  return (
    <div className={`lungs-art ${mode}`} aria-hidden="true">
      <svg className="lungs-rays" viewBox="0 0 240 240">
        {rayAngles.map((angle, i) => (
          <g key={angle} transform={`rotate(${angle} 120 120)`}>
            <rect
              className="lungs-ray" x="118.5" y="6" width="3" height="16" rx="1.5"
              // running: neighbours pulse slightly apart; starting: one sweep per turn
              style={{ animationDelay: mode === 'starting' ? `${(i * 1.2) / RAYS}s` : `${(i % 12) * 0.05}s` }}
            />
          </g>
        ))}
      </svg>
      <svg className="lungs-svg" viewBox="0 0 200 175">
        <defs>
          <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fecdd3" /><stop offset=".55" stopColor="#fda4af" /><stop offset="1" stopColor="#f4899b" />
          </linearGradient>
          <radialGradient id={`${id}s`} cx=".35" cy=".3" r=".8">
            <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}o`} cx=".5" cy=".55" r=".6">
            <stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}c`}><path d={RIGHT} /><path d={LEFT} /></clipPath>
        </defs>

        <g className="lungs-body">
          <path d={RIGHT} fill={ref('t')} />
          <path d={LEFT} fill={ref('t')} />
          <g clipPath={ref('c')}>
            <rect className="lungs-o2" x="0" y="20" width="200" height="150" fill={ref('o')} />
            <path d={TREE} fill="none" stroke="#fff1f2" strokeWidth="2.2" strokeLinecap="round" opacity=".9" />
            <path d={FISSURES} fill="none" stroke="#e0607e" strokeWidth="1.2" opacity=".45" />
            <path d={RIGHT} fill={ref('s')} />
            <path d={LEFT} fill={ref('s')} />
          </g>
          <path d={RIGHT} fill="none" stroke="#d9546f" strokeWidth="1.8" />
          <path d={LEFT} fill="none" stroke="#d9546f" strokeWidth="1.8" />
          <path d={TRACHEA} fill="#fbcfe8" stroke="#d9546f" strokeWidth="1.6" strokeLinejoin="round" />
          <path d={RINGS} stroke="#e48aa3" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
