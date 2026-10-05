import { describe, it, expect } from 'vitest';
import { normalizeCountryName, sameCountry } from '../utils/countryName.js';
import { samePlace, sameTravelDay } from '../utils/placeMatch.js';

describe('country names', () => {
  it('strips green markers', () => {
    expect(normalizeCountryName('Poland GREEN')).toBe('Poland');
    expect(normalizeCountryName('Czechia GREEN')).toBe('Czechia');
    expect(normalizeCountryName('Latvia (green)')).toBe('Latvia');
    expect(normalizeCountryName('Italy - green travel')).toBe('Italy');
    expect(normalizeCountryName('Greece')).toBe('Greece');
    expect(normalizeCountryName('Greenland')).toBe('Greenland');
  });
  it('compares countries', () => {
    expect(sameCountry('Poland GREEN', 'Poland')).toBe(true);
    expect(sameCountry('Poland', 'Latvia')).toBe(false);
  });
});

describe('place matching', () => {
  it('treats station variants and diacritics as the same place', () => {
    expect(samePlace('Wrocław Główny', 'Wroclaw')).toBe(true);
    expect(samePlace('Warszawa Centralna', 'Warszawa')).toBe(true);
    expect(samePlace('Rīga', 'Riga')).toBe(true);
    expect(samePlace('Milano Centrale', 'Milan Malpensa')).toBe(true);
    expect(samePlace('Vilnius', 'Riga')).toBe(false);
    expect(samePlace('Valmiera', 'Vilnius')).toBe(false);
  });
  it('allows one day of difference', () => {
    expect(sameTravelDay('2026-08-22T00:00:00Z', '2026-08-22T23:00:00Z')).toBe(true);
    expect(sameTravelDay('2026-08-22', '2026-08-24')).toBe(false);
  });
});
