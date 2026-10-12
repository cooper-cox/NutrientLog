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

function roundTowards(value: number, roundUp: boolean): number {
  return roundUp ? Math.ceil(value - EPSILON) : Math.floor(value + EPSILON);
}

/**
 * A weight limit as text in the person's units, rounded so the limit shown is never too generous:
 * lower limits round up and upper limits round down, so typing exactly the number shown is
 * always accepted. Matches the wording the server uses.
 */
export function formatWeightLimit(
  kg: number,
  units: 'metric' | 'imperial',
  roundUp: boolean,
): string {
  const whole = roundTowards(units === 'metric' ? kg : kgToLb(kg), roundUp);
  return units === 'metric' ? `${whole} kg` : `${whole} lb`;
}

/** A height limit as text: centimetres, or feet and whole inches. Rounded as above. */
export function formatHeightLimit(
  cm: number,
  units: 'metric' | 'imperial',
  roundUp: boolean,
): string {
  if (units === 'metric') return `${roundTowards(cm, roundUp)} cm`;
  const totalInches = roundTowards(cm / CM_PER_INCH, roundUp);
  return `${Math.floor(totalInches / 12)} ft ${totalInches % 12} in`;
}
