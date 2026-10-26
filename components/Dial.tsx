'use client';

import type { CSSProperties } from 'react';
import { polar, sectorPath, wrapLabel } from '@/lib/geometry';
import { PUBLISH_INTERVAL_MS, WEDGE_COLORS } from '@/lib/constants';
import { fillFor, needsLightText } from '@/lib/density';
import { dotsFor, type PhoneReading } from '@/lib/dots';

const INK = '#2a211a';
const INK_INVERSE = '#fdfaf5';
const HUB = '#fffdf9';

const CX = 200;
const CY = 200;
const R_INNER = 70;
const R_OUTER = 190;
const R_LABEL = 106;
const R_COUNT = 154;

export interface DialProps {
  options: string[];
  counts: number[];
  active: number | null;
  heading: number | null;
  magnitude: number;
  total: number;
  showCounts: boolean;
  /** host view: one dot per phone, drawn where that phone is pointing */
  readings?: PhoneReading[];
}

export function Dial({
  options,
  counts,
  active,
  heading,
  magnitude,
  total,
  showCounts,
  readings,
}: DialProps) {
  // The needle rides from the hub edge outward in proportion to how hard the
  // phone is tilted, so a gentle lean reads differently from a firm commit.
  const reach = Math.min(1, magnitude / 45);
  const needle =
    heading === null ? null : polar(CX, CY, R_INNER + reach * (R_OUTER - R_INNER - 22), heading);

  // Darkness is relative to whichever wedge is winning, so the dial always
  // shows a leader instead of equally pale tiles.
  const wedgeDeg = 360 / options.length;
  const labelRadius = options.length > 6 ? 132 : R_LABEL;
  const labelChars = options.length > 6 ? 8 : 12;
  const peak = Math.max(0, ...counts);

  return (
    <svg className="dial" viewBox="0 0 400 400" role="img" aria-label="Tilt dial">
      {options.map((label, w) => {
        const centre = w * wedgeDeg;
        const colour = WEDGE_COLORS[w];
        const isActive = active === w;
        const lines = wrapLabel(label, labelChars);

        const labelAt = polar(CX, CY, labelRadius, centre);
        const countAt = polar(CX, CY, (options.length > 6 ? 174 : R_COUNT), centre);
        const fill = fillFor(counts[w] ?? 0, peak);
        const text = needsLightText(fill) ? INK_INVERSE : INK;

        return (
          <g key={w} className={`sector${isActive ? ' is-active' : ''}`}>
            <path
              className="sector-fill"
              d={sectorPath(CX, CY, R_INNER, R_OUTER, centre - wedgeDeg / 2 + 1.2, centre + wedgeDeg / 2 - 1.2)}
              fill={colour}
              fillOpacity={fill}
              stroke={isActive ? INK : colour}
              strokeOpacity={isActive ? 0.85 : 0.35}
              strokeWidth={isActive ? 3 : 1.5}
            />

            {showCounts && (
              <text
                className="sector-count tabular"
                x={countAt.x}
                y={countAt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={text}
                opacity={counts[w] ? 1 : 0.3}
              >
                {counts[w] ?? 0}
              </text>
            )}

            <text
              className="sector-label"
              x={labelAt.x}
              y={labelAt.y - ((lines.length - 1) * 15) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={text}
            >
              {lines.map((line, i) => (
                <tspan key={i} x={labelAt.x} dy={i === 0 ? 0 : 15}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      <circle cx={CX} cy={CY} r={R_INNER - 4} fill={HUB} />
      <circle
        className={active === null ? 'hub-ring' : undefined}
        cx={CX}
        cy={CY}
        r={R_INNER - 4}
        fill="none"
        stroke="rgba(42,33,26,0.38)"
        strokeWidth={2}
        strokeDasharray="4 7"
      />

      <text
        className="hub-label tabular"
        x={CX}
        y={CY - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={INK}
        fontSize={40}
      >
        {total}
      </text>
      <text
        x={CX}
        y={CY + 22}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(42,33,26,0.5)"
        fontSize={11}
        letterSpacing="2.4"
      >
        {total === 1 ? 'PHONE' : 'PHONES'}
      </text>

      {readings && readings.length > 0 && (
        // Dots ease over exactly one publish interval, so they are still
        // travelling when the next position lands and the room reads a moving
        // crowd rather than a strobe. Passed down rather than hardcoded in the
        // stylesheet: the two numbers are one decision.
        <g className="dots" style={{ '--dot-travel': `${PUBLISH_INTERVAL_MS}ms` } as CSSProperties}>
          {dotsFor(readings, CX, CY, R_INNER, R_OUTER - 16).map((d) => (
            <circle
              key={d.id}
              className="dot-phone"
              cx={d.x}
              cy={d.y}
              r={d.flat ? 4 : 6}
              fill={d.flat ? 'rgba(42,33,26,0.28)' : INK}
              stroke={HUB}
              strokeWidth={1.5}
            />
          ))}
        </g>
      )}

      {needle && (
        <>
          <line
            x1={CX}
            y1={CY}
            x2={needle.x}
            y2={needle.y}
            stroke="rgba(42,33,26,0.45)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={needle.x} cy={needle.y} r={10} fill={INK} />
        </>
      )}
    </svg>
  );
}
