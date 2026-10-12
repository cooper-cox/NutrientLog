export const KG_PER_LB = 0.45359237;
export const CM_PER_INCH = 2.54;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

/** Splits a height into whole feet and inches (to one decimal place). */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = round1(cm / CM_PER_INCH);
  let feet = Math.floor(totalInches / 12);
  let inches = round1(totalInches - feet * 12);
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** A weight as text in the person's units, e.g. "80 kg" or "176.4 lb". */
export function formatWeight(kg: number, units: 'metric' | 'imperial'): string {
  return units === 'metric' ? `${round1(kg)} kg` : `${round1(kgToLb(kg))} lb`;
}

/** A weekly rate as text. Pounds are rounded to the nearest half pound ("about 1 lb"). */
export function formatRate(kgPerWeek: number, units: 'metric' | 'imperial'): string {
  if (units === 'metric') return `${kgPerWeek} kg per week`;
  const pounds = Math.round(kgToLb(kgPerWeek) * 2) / 2;
  return `about ${pounds} lb per week`;
}

const EPSILON = 1e-9;

function roundToStep(value: number, step: number, roundUp: boolean): number {
  const steps = value / step;
  return (roundUp ? Math.ceil(steps - EPSILON) : Math.floor(steps + EPSILON)) * step;
}

/**
 * A weight limit as text in the person's units, rounded to a tidy multiple of `step` that is
 * never too generous: lower limits round up and upper limits round down, so typing exactly the
 * number shown is always accepted. Matches the wording the server uses.
 */
export function formatWeightLimit(
  kg: number,
  units: 'metric' | 'imperial',
  roundUp: boolean,
  step = 1,
): string {
  const whole = roundToStep(units === 'metric' ? kg : kgToLb(kg), step, roundUp);
  return units === 'metric' ? `${whole} kg` : `${whole} lb`;
}

/**
 * A height limit as text: centimetres (to the nearest 5), or feet and inches (to the nearest half
 * foot). Rounded as above.
 */
export function formatHeightLimit(
  cm: number,
  units: 'metric' | 'imperial',
  roundUp: boolean,
): string {
  if (units === 'metric') return `${roundToStep(cm, 5, roundUp)} cm`;
  const totalInches = roundToStep(cm / CM_PER_INCH, 6, roundUp);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches === 0 ? `${feet} ft` : `${feet} ft ${inches} in`;
}
