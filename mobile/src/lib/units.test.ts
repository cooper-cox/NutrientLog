import { cmToFtIn, formatRate, formatWeight, ftInToCm, kgToLb, lbToKg, round1 } from './units';

describe('conversions', () => {
  it('converts pounds and kilograms both ways', () => {
    expect(lbToKg(176)).toBeCloseTo(79.83, 2);
    expect(kgToLb(80)).toBeCloseTo(176.37, 2);
    expect(kgToLb(lbToKg(150))).toBeCloseTo(150, 6);
  });

  it('converts feet and inches to centimetres', () => {
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 2);
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 2);
  });

  it('splits centimetres into feet and inches', () => {
    expect(cmToFtIn(180)).toEqual({ feet: 5, inches: 10.9 });
    expect(cmToFtIn(182.88)).toEqual({ feet: 6, inches: 0 });
  });

  it('never shows 12 inches', () => {
    // 5 ft 11.97 in rounds up to the next foot.
    expect(cmToFtIn(ftInToCm(5, 11.97))).toEqual({ feet: 6, inches: 0 });
  });

  it('rounds to one decimal place', () => {
    expect(round1(79.83)).toBe(79.8);
    expect(round1(0.05)).toBe(0.1);
  });
});

describe('formatting', () => {
  it('shows weights in the person’s units', () => {
    expect(formatWeight(80, 'metric')).toBe('80 kg');
    expect(formatWeight(80, 'imperial')).toBe('176.4 lb');
  });

  it('shows weekly rates in kilograms or rounded to half pounds', () => {
    expect(formatRate(0.25, 'metric')).toBe('0.25 kg per week');
    expect(formatRate(0.25, 'imperial')).toBe('about 0.5 lb per week');
    expect(formatRate(0.5, 'imperial')).toBe('about 1 lb per week');
    expect(formatRate(0.75, 'imperial')).toBe('about 1.5 lb per week');
  });
});
