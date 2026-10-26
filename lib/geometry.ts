/** SVG helpers for the circular dial. Angles run clockwise from straight up. */

export interface Point {
  x: number;
  y: number;
}

export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  // Node and browsers can differ in their last trig decimal. Keep SVG
  // coordinates stable across server rendering and hydration.
  return {
    x: Number((cx + r * Math.sin(rad)).toFixed(6)),
    y: Number((cy - r * Math.cos(rad)).toFixed(6)),
  };
}

/** Donut sector from startDeg to endDeg. The hole is where the dead zone lives. */
export function sectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, startDeg);
  const o2 = polar(cx, cy, rOuter, endDeg);
  const i2 = polar(cx, cy, rInner, endDeg);
  const i1 = polar(cx, cy, rInner, startDeg);

  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

/** A wedge has room for three lines of label and no more. */
export const MAX_LABEL_LINES = 3;

/**
 * Greedy wrap for wedge labels. SVG has no text flow, so lines are laid out as
 * tspans and the caller needs to know how many there are.
 *
 * Labels are editable mid-demo, so overflow is ellipsised rather than dropped --
 * a host who types too much should see it on the dial, not discover afterwards
 * that a word went missing.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const cut = Math.max(1, maxChars - 1);
  const lines: string[] = [];
  let line = '';

  const flush = () => {
    if (line) lines.push(line);
    line = '';
  };

  for (let word of text.trim().split(/\s+/).filter(Boolean)) {
    // A word wider than the wedge has to be broken, or it spills past the dial.
    while (word.length > maxChars) {
      flush();
      lines.push(`${word.slice(0, cut)}-`);
      word = word.slice(cut);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      flush();
      line = word;
    }
  }
  flush();

  if (lines.length <= MAX_LABEL_LINES) return lines;

  const kept = lines.slice(0, MAX_LABEL_LINES);
  const last = kept[MAX_LABEL_LINES - 1];
  kept[MAX_LABEL_LINES - 1] = `${last.slice(0, cut).trimEnd()}…`;
  return kept;
}
