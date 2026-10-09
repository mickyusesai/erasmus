/**
 * Participant CSV import that copes with the files spreadsheet apps really produce:
 * - Excel "CSV UTF-8" starts with a byte-order mark
 * - Excel with continental-European settings separates columns with ";" and
 *   saves the classic "CSV" format in Windows-1252, not UTF-8
 * - Excel "Unicode text" is UTF-16 and tab-separated
 * - organisers rename columns, often in their own language ("Nome", "Cognome", ...)
 * Every row that can't be imported gets a reason, so the organiser sees why.
 */
import { parse } from 'csv-parse/sync';

export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type ParticipantField = 'firstName' | 'lastName' | 'email' | 'country';

export interface CsvParticipant {
  /** Line number in the file, as the organiser sees it in their spreadsheet */
  row: number;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
}

export interface CsvSkippedRow {
  row: number;
  reason: string;
}

export interface ParticipantCsvResult {
  participants: CsvParticipant[];
  skipped: CsvSkippedRow[];
  /** Column headers as written in the file */
  columns: string[];
  /** Required fields for which no column was found */
  missingColumns: ParticipantField[];
  delimiter: string;
  encoding: CsvEncoding;
}

/** The file can't be read as CSV at all (e.g. an unclosed quote) */
export class CsvReadError extends Error {
  constructor(message: string, public line?: number) {
    super(message);
    this.name = 'CsvReadError';
  }
}

export const FIELD_LABELS: Record<ParticipantField, string> = {
  firstName: 'first name',
  lastName: 'last name',
  email: 'email',
  country: 'country',
};

// ── Decoding ──────────────────────────────────────────────────────────────────

export function decodeCsvBuffer(buffer: Buffer): { text: string; encoding: CsvEncoding } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { text: buffer.subarray(3).toString('utf-8'), encoding: 'utf-8' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { text: buffer.subarray(2).toString('utf16le'), encoding: 'utf-16le' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = Buffer.from(buffer.subarray(2, 2 + Math.floor((buffer.length - 2) / 2) * 2));
    body.swap16();
    return { text: body.toString('utf16le'), encoding: 'utf-16be' };
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' };
  } catch {
    // Not valid UTF-8: Excel's classic "CSV" format is Windows-1252 on European systems
    try {
      return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'windows-1252' };
    } catch {
      return { text: buffer.toString('latin1'), encoding: 'windows-1252' };
    }
  }
}

// ── Delimiter ─────────────────────────────────────────────────────────────────

/** Picks the separator from the header line; honours Excel's optional "sep=;" first line */
export function detectDelimiter(text: string): { delimiter: string; fromLine: number } {
  const lines = text.split(/\r\n|\n|\r/);
  const idx = lines.findIndex((l) => l.trim() !== '');
  if (idx === -1) return { delimiter: ',', fromLine: 1 };

  const sep = lines[idx].trim().match(/^"?sep=(.)"?$/i);
  if (sep) return { delimiter: sep[1], fromLine: idx + 2 };

  // Look at the first few lines: the real separator appears the same number of
  // times on every line, a comma inside an unquoted city name does not.
  const sample = lines.slice(idx).filter((l) => l.trim() !== '').slice(0, 6);
  const countOutsideQuotes = (line: string, ch: string) => {
    let n = 0;
    let inQuotes = false;
    for (const c of line) {
      if (c === '"') inQuotes = !inQuotes;
      else if (c === ch && !inQuotes) n++;
    }
    return n;
  };
  let best = ',';
  let bestScore = 0;
  for (const candidate of [',', ';', '\t', '|']) {
    const counts = sample.map((l) => countOutsideQuotes(l, candidate)).filter((n) => n > 0);
    if (counts.length === 0) continue;
    const freq = new Map<number, number>();
    for (const n of counts) freq.set(n, (freq.get(n) || 0) + 1);
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = times * 1000 + mode;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return { delimiter: best, fromLine: 1 };
}

// ── Column names ──────────────────────────────────────────────────────────────

export function normalizeHeader(header: string): string {
  return header
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

// Exact (normalised) column names, in English and the main Erasmus+ languages
const ALIASES: Record<ParticipantField | 'fullName', string[]> = {
  firstName: [
    'firstname', 'first', 'fname', 'givenname', 'givennames', 'forename', 'forenames', 'christianname',
    'nome', 'nomeproprio', 'nombre', 'nombres', 'prenom', 'prenoms', 'vorname', 'vornamen', 'voornaam',
    'imie', 'vardas', 'vards', 'eesnimi', 'etunimi', 'fornavn', 'fornamn', 'ime', 'meno', 'jmeno',
    'keresztnev', 'utonev', 'prenume', 'isem', 'ad', 'primeironome',
  ],
  lastName: [
    'lastname', 'last', 'lname', 'surname', 'surnames', 'familyname',
    'cognome', 'apellido', 'apellidos', 'apelido', 'apelidos', 'sobrenome', 'ultimonome', 'nom', 'nomdefamille',
    'nachname', 'familienname', 'achternaam', 'nazwisko', 'pavarde', 'uzvards', 'perekonnanimi', 'sukunimi',
    'efternavn', 'efternamn', 'etternavn', 'prezime', 'priimek', 'priezvisko', 'prijmeni', 'vezeteknev',
    'csaladnev', 'nume', 'numedefamilie', 'kunjom', 'soyad', 'soyadi',
  ],
  email: [
    'email', 'emails', 'emailaddress', 'emailadres', 'emailadresse', 'emailadresa', 'mail', 'mailaddress',
    'epost', 'epostadress', 'epostadresse', 'correo', 'correoelectronico', 'courriel', 'adresseemail',
    'adressemail', 'indirizzoemail', 'postaelettronica', 'epasts', 'elpastas', 'sahkoposti', 'eposta',
  ],
  country: [
    'country', 'sendingcountry', 'countryofresidence', 'residencecountry', 'homecountry', 'countryoforigin',
    'paese', 'paesediprovenienza', 'paesedorigine', 'paesediresidenza', 'nazione', 'pais', 'paisdeorigen',
    'paisderesidencia', 'pays', 'paysdorigine', 'paysderesidence', 'land', 'herkunftsland', 'wohnland',
    'kraj', 'salis', 'valsts', 'riik', 'maa', 'krajina', 'zeme', 'orszag', 'drzava', 'tara', 'pajjiz', 'ulke',
  ],
  fullName: [
    'fullname', 'participant', 'participantname', 'nameandsurname', 'namesurname', 'firstandlastname',
    'nomecompleto', 'nomeecognome', 'nombrecompleto', 'nomcomplet', 'vollername', 'naam', 'volledigenaam',
    'imieinazwisko',
  ],
};

interface ColumnMap {
  firstName?: number;
  lastName?: number;
  email?: number;
  country?: number;
  fullName?: number;
}

export function mapColumns(headers: string[]): ColumnMap {
  const norm = headers.map(normalizeHeader);
  const map: ColumnMap = {};
  const used = new Set<number>();
  const take = (field: keyof ColumnMap, test: (h: string) => boolean) => {
    if (map[field] !== undefined) return;
    const i = norm.findIndex((h, idx) => h !== '' && !used.has(idx) && test(h));
    if (i !== -1) {
      map[field] = i;
      used.add(i);
    }
  };

  // 1. exact names
  for (const field of ['email', 'country', 'firstName', 'lastName', 'fullName'] as const) {
    take(field, (h) => ALIASES[field].includes(h));
  }
  // 2. a lone "name" column: first name next to a surname column, otherwise a full name
  if (map.firstName === undefined && map.lastName !== undefined) take('firstName', (h) => h === 'name');
  else if (map.lastName === undefined && map.firstName !== undefined) take('lastName', (h) => h === 'name');
  else if (map.firstName === undefined && map.lastName === undefined) take('fullName', (h) => h === 'name');
  // 3. looser matches for descriptive headers ("E-mail address of participant", "Nome partecipante")
  take('email', (h) => h.includes('mail'));
  take('country', (h) => h.includes('country') || h.includes('paese') || h.includes('nazione') || h.endsWith('land'));
  take('fullName', (h) => ['fullname', 'completo', 'complet', 'nomeecognome', 'nameandsurname', 'vollername'].some((k) => h.includes(k)));
  take('lastName', (h) => ['lastname', 'surname', 'familyname', 'cognome', 'apellido', 'nachname', 'achternaam', 'nazwisko'].some((k) => h.includes(k)));
  take('firstName', (h) => ['firstname', 'givenname', 'nome', 'nombre', 'prenom', 'vorname', 'voornaam', 'imie'].some((k) => h.startsWith(k)));
  // 4. nationality only when nothing else describes the country
  take('country', (h) => h === 'nationality' || h === 'nazionalita' || h === 'nacionalidad' || h === 'nationalite');
  return map;
}

// ── Values ────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function clean(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/[​-‍﻿]/g, '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
}

const LOWER_WORDS = new Set(['and', 'of', 'the', 'e', 'y', 'et', 'und', 'en', 'di', 'de', 'del', 'la']);

/** "ITALY" / "italy" → "Italy"; leaves mixed case and short codes ("UK") alone */
export function normalizeCountryValue(value: string): string {
  const v = clean(value);
  if (v.length <= 3) return v;
  if (v !== v.toUpperCase() && v !== v.toLowerCase()) return v;
  return v
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && LOWER_WORDS.has(word) ? word : word.replace(/(^|-)(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase())))
    .join(' ');
}

function splitFullName(full: string): { firstName: string; lastName: string } | null {
  const parts = full.split(' ').filter(Boolean);
  if (parts.length < 2) return null;
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function parseParticipantCsv(buffer: Buffer): ParticipantCsvResult {
  const { text, encoding } = decodeCsvBuffer(buffer);
  const { delimiter, fromLine } = detectDelimiter(text);

  let records: { info: { lines: number }; record: string[] }[];
  try {
    records = parse(text, {
      delimiter,
      from_line: fromLine,
      info: true,
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as unknown as { info: { lines: number }; record: string[] }[];
  } catch (err) {
    const line = (err as { lines?: number }).lines;
    throw new CsvReadError(
      `The file couldn't be read${line ? ` near line ${line}` : ''}. Check that row for a stray quote character (").`,
      line
    );
  }

  const empty: ParticipantCsvResult = { participants: [], skipped: [], columns: [], missingColumns: ['firstName', 'lastName', 'email', 'country'], delimiter, encoding };
  if (records.length === 0) return empty;

  // The header is usually the first row, but hand-made sheets often have a title above it
  const coverage = (m: ColumnMap) =>
    (m.firstName !== undefined || m.fullName !== undefined ? 1 : 0) +
    (m.lastName !== undefined || m.fullName !== undefined ? 1 : 0) +
    (m.email !== undefined ? 1 : 0) +
    (m.country !== undefined ? 1 : 0);
  let headerIndex = 0;
  let bestCoverage = -1;
  for (let i = 0; i < Math.min(5, records.length); i++) {
    const c = coverage(mapColumns(records[i].record.map(clean)));
    if (c > bestCoverage) {
      headerIndex = i;
      bestCoverage = c;
    }
    if (c === 4) break;
  }

  const headers = records[headerIndex].record.map(clean);
  const columns = headers.filter((h) => h !== '');
  const map = mapColumns(headers);
  const missingColumns: ParticipantField[] = [];
  if (map.firstName === undefined && map.fullName === undefined) missingColumns.push('firstName');
  if (map.lastName === undefined && map.fullName === undefined) missingColumns.push('lastName');
  if (map.email === undefined) missingColumns.push('email');
  if (map.country === undefined) missingColumns.push('country');

  const participants: CsvParticipant[] = [];
  const skipped: CsvSkippedRow[] = [];
  if (missingColumns.length > 0) {
    return { participants, skipped, columns, missingColumns, delimiter, encoding };
  }

  const seen = new Map<string, number>();
  for (const { info, record } of records.slice(headerIndex + 1)) {
    const row = info.lines;
    const get = (i: number | undefined) => (i === undefined ? '' : clean(record[i]));

    let firstName = get(map.firstName);
    let lastName = get(map.lastName);
    if (!firstName && !lastName && map.fullName !== undefined) {
      const split = splitFullName(get(map.fullName));
      if (split) ({ firstName, lastName } = split);
    } else if (map.fullName !== undefined && (!firstName || !lastName)) {
      const split = splitFullName(get(map.fullName));
      if (split) {
        firstName = firstName || split.firstName;
        lastName = lastName || split.lastName;
      }
    }
    const email = get(map.email).replace(/^mailto:/i, '').toLowerCase();
    const country = normalizeCountryValue(get(map.country));

    // Excel keeps formatted-but-empty rows as ";;;" — ignore rows without any participant data
    if (!firstName && !lastName && !email && !country) continue;

    const missing = (
      [['firstName', firstName], ['lastName', lastName], ['email', email], ['country', country]] as [ParticipantField, string][]
    )
      .filter(([, v]) => !v)
      .map(([f]) => FIELD_LABELS[f]);
    if (missing.length > 0) {
      skipped.push({ row, reason: `missing ${missing.join(', ')}` });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      skipped.push({ row, reason: `"${email}" is not a valid email address` });
      continue;
    }
    const firstRow = seen.get(email);
    if (firstRow !== undefined) {
      skipped.push({ row, reason: `${email} is already on row ${firstRow}` });
      continue;
    }
    seen.set(email, row);
    participants.push({ row, firstName, lastName, email, country });
  }

  return { participants, skipped, columns, missingColumns, delimiter, encoding };
}

// ── Country spelling ──────────────────────────────────────────────────────────

const foldCountry = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Reuses the project's existing spelling of a country ("italy" → "Italy") so an
 * import never creates a second country-limit row that differs only in case or accents.
 * `known` grows as new countries are seen, so the first spelling in the file wins.
 */
export function alignCountry(country: string, known: string[]): string {
  const folded = foldCountry(country);
  const match = known.find((k) => foldCountry(k) === folded);
  if (match) return match;
  known.push(country);
  return country;
}
