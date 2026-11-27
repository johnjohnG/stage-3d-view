import type { Vec3Tuple } from '../types/stage';

export interface LineColorSwatch {
  name: string;
  hex: string;
}

export const LINE_COLORS: LineColorSwatch[] = [
  { name: 'Signal Red', hex: '#EF4444' },
  { name: 'Power Amber', hex: '#F59E0B' },
  { name: 'DMX Cyan', hex: '#06B6D4' },
  { name: 'Audio Emerald', hex: '#10B981' },
  { name: 'Stage Blue', hex: '#3B82F6' },
  { name: 'Video Violet', hex: '#A855F7' },
  { name: 'Chalk White', hex: '#F1F5F9' },
  { name: 'Safety Yellow', hex: '#EAB308' },
];

/**
 * Convert decimal feet into whole feet and remaining inches.
 * Rounds inches to nearest 0.25" to keep Imperial measurements crisp.
 */
export function feetToFeetAndInches(decimalFeet: number): { feet: number; inches: number } {
  const safe = Number.isFinite(decimalFeet) ? decimalFeet : 0;
  const sign = safe < 0 ? -1 : 1;
  const absInchesTotal = Math.round(Math.abs(safe) * 12 * 4) / 4; // quarter-inch precision
  let feet = Math.floor(absInchesTotal / 12);
  let inches = Math.round((absInchesTotal - feet * 12) * 4) / 4;

  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }

  return {
    feet: sign * feet,
    inches: sign < 0 && feet === 0 ? -inches : inches,
  };
}

export function feetAndInchesToDecimal(feet: number, inches: number): number {
  const f = Number.isFinite(feet) ? feet : 0;
  const i = Number.isFinite(inches) ? inches : 0;
  return f + i / 12;
}

/**
 * Format decimal feet as crisp Imperial feet & inches string, e.g. 24' 6" or 8' 3.5".
 */
export function formatFeetInches(decimalFeet: number, showZeroInches = true): string {
  const { feet, inches } = feetToFeetAndInches(decimalFeet);
  const absInches = Math.abs(inches);
  const inchStr = Number.isInteger(absInches)
    ? String(absInches)
    : absInches.toFixed(2).replace(/\.?0+$/, '');

  if (!showZeroInches && absInches === 0) {
    return `${feet}'`;
  }
  if (feet === 0 && decimalFeet < 0) {
    return `-${inchStr}"`;
  }
  return `${feet}' ${inchStr}"`;
}

export function calculateDistanceFeet(a: Vec3Tuple, b: Vec3Tuple): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function calculatePolylineFeet(points: Vec3Tuple[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += calculateDistanceFeet(points[i - 1], points[i]);
  }
  return total;
}

export function clampStageNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
