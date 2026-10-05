/**
 * Organisers sometimes register pseudo-countries such as "Poland GREEN" to give
 * green travellers a different maximum. For anything that reasons about where a
 * participant lives (AI prompts, home-country checks) only the real country
 * matters, so strip such markers.
 */
const MARKERS = /[\s\-_(\[]*(green(\s*travel(ler|er)?)?|eco|sustainable)[\s)\]]*$/i;

export function normalizeCountryName(name: string | null | undefined): string {
  if (!name) return '';
  return name.replace(MARKERS, '').replace(/[\s\-_]+$/, '').trim();
}

/** True when two country strings refer to the same country (ignoring markers, case, accents) */
export function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  const fold = (s: string) => normalizeCountryName(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return fold(a || '') !== '' && fold(a || '') === fold(b || '');
}
