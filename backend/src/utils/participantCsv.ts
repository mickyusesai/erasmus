/**
 * Participant CSV import that copes with the files spreadsheet apps really produce:
 * - Excel "CSV UTF-8" starts with a byte-order mark
 * - Excel with continental-European settings separates columns with ";" and
 *   saves the classic "CSV" format in Windows-1252, not UTF-8
 * - Excel "Unicode text" is UTF-16 and tab-separated
 * - organisers rename columns, often in their own language ("Nome", "Cognome", ...)
 * - a list is pasted without a header row, straight from a sheet, a message or the
 *   "To" line of an email ("Anna Nowak <anna@example.org>; ..."): the columns are then
 *   recognised by what is in them
 * Every row that can't be imported gets a reason, so the organiser sees why.
 */
import { parse } from 'csv-parse/sync';
import { normalizeCountryName } from './countryName.js';

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
  /** There was no header row: the columns were recognised by what is in them */
  headerless: boolean;
}

export interface ParticipantCsvOptions {
  /** The sending country for rows that don't say one (a list of one partner's participants) */
  defaultCountry?: string;
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

// ── Lists without a header row ────────────────────────────────────────────────

// Country names as organisers write them: English and the country's own language
const KNOWN_COUNTRIES = new Set(
  [
    'albania', 'algeria', 'armenia', 'austria', 'osterreich', 'azerbaijan', 'belarus', 'belgium', 'belgie', 'belgique',
    'bosnia and herzegovina', 'bosnia', 'bulgaria', 'croatia', 'hrvatska', 'cyprus', 'czech republic', 'czechia', 'cesko',
    'denmark', 'danmark', 'egypt', 'estonia', 'eesti', 'finland', 'suomi', 'france', 'georgia', 'germany', 'deutschland',
    'greece', 'ellada', 'hellas', 'hungary', 'magyarorszag', 'iceland', 'island', 'ireland', 'eire', 'israel', 'italy', 'italia',
    'jordan', 'kazakhstan', 'kosovo', 'latvia', 'latvija', 'lebanon', 'libya', 'liechtenstein', 'lithuania', 'lietuva',
    'luxembourg', 'malta', 'moldova', 'montenegro', 'crna gora', 'morocco', 'maroc', 'netherlands', 'the netherlands',
    'nederland', 'holland', 'north macedonia', 'macedonia', 'norway', 'norge', 'palestine', 'poland', 'polska', 'portugal',
    'romania', 'russia', 'serbia', 'srbija', 'slovakia', 'slovensko', 'slovenia', 'slovenija', 'spain', 'espana', 'sweden',
    'sverige', 'switzerland', 'schweiz', 'suisse', 'svizzera', 'syria', 'tunisia', 'tunisie', 'turkey', 'turkiye', 'ukraine',
    'ukraina', 'united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland',
  ]
);

const foldText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A country as organisers write it, also with a green-travel mark ("Poland GREEN") */
export function isKnownCountry(value: string): boolean {
  return KNOWN_COUNTRIES.has(foldText(normalizeCountryName(value)));
}

const EMAIL_INSIDE = /[^\s@,;<>"()]+@[^\s@,;<>"()]+\.[^\s@,;<>"()]+/;

interface ListRow {
  /** Line number as the organiser sees it */
  line: number;
  cells: string[];
}

/** The columns of a list copied from an email program: first name, last name, email */
const ADDRESS_LIST_COLUMNS: ColumnMap = { firstName: 0, lastName: 1, email: 2 };

/** "Anna Nowak <anna@example.org>; Zajac, Piotr <piotr@example.org>" as copied from an email program */
function rowsFromAddressList(text: string): ListRow[] | null {
  if (!/<\s*[^<>\s]+@[^<>\s]+\s*>/.test(text)) return null;
  const rows: ListRow[] = [];
  text.split(/\r\n|\n|\r/).forEach((lineText, index) => {
    const entry = /([^<>]*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/g;
    let match: RegExpExecArray | null;
    while ((match = entry.exec(lineText)) !== null) {
      const name = clean(clean(match[1].replace(/^[\s,;]+/, '')));
      // "Zajac, Piotr" is surname first
      const comma = name.match(/^([^,]+),\s*(.+)$/);
      const split = comma ? { firstName: clean(comma[2]), lastName: clean(comma[1]) } : splitFullName(name) ?? { firstName: name, lastName: '' };
      rows.push({ line: index + 1, cells: [split.firstName, split.lastName, match[2]] });
    }
  });
  return rows.length > 0 ? rows : null;
}

/** One person per line with only spaces in between: "Anna Nowak anna@example.org Poland" */
function splitAroundEmail(cells: string[]): string[] {
  const filled = cells.filter((c) => c !== '');
  if (filled.length !== 1 || EMAIL_RE.test(filled[0])) return cells;
  const match = filled[0].match(EMAIL_INSIDE);
  if (!match || match.index === undefined) return cells;
  let before = clean(filled[0].slice(0, match.index));
  let after = clean(filled[0].slice(match.index + match[0].length));
  // The country may stand before the email: "Anna Nowak Poland anna@example.org"
  if (!after) {
    const words = before.split(' ');
    for (const take of [3, 2, 1]) {
      if (words.length > take && isKnownCountry(words.slice(-take).join(' '))) {
        after = words.slice(-take).join(' ');
        before = words.slice(0, -take).join(' ');
        break;
      }
    }
  }
  return [before, match[0], after];
}

/** Which column holds what, judged by the values: the email addresses, the countries, the names */
export function mapColumnsByContent(rows: string[][]): ColumnMap | null {
  const sample = rows.slice(0, 40);
  const width = Math.max(0, ...sample.map((r) => r.length));
  const count = (test: (value: string) => boolean) =>
    Array.from({ length: width }, (_, i) => sample.filter((r) => r[i] && test(r[i])).length);
  const filled = count(() => true);
  const emails = count((v) => EMAIL_RE.test(v.replace(/^mailto:/i, '')));
  const emailColumn = emails.indexOf(Math.max(0, ...emails));
  if (emailColumn === -1 || emails[emailColumn] === 0) return null;

  const others = Array.from({ length: width }, (_, i) => i).filter((i) => i !== emailColumn && filled[i] > 0);
  const countries = count(isKnownCountry);
  let countryColumn: number | undefined = others
    .filter((i) => countries[i] > 0 && countries[i] >= filled[i] / 2)
    .sort((a, b) => countries[b] - countries[a])[0];
  let names = others.filter((i) => i !== countryColumn);
  // A country we don't know the name of: with first name, last name and one more column, that one is it
  if (countryColumn === undefined && names.length >= 3) {
    countryColumn = names[names.length - 1];
    names = names.slice(0, -1);
  }

  const map: ColumnMap = { email: emailColumn };
  if (countryColumn !== undefined) map.country = countryColumn;
  if (names.length >= 2) {
    map.firstName = names[0];
    map.lastName = names[1];
  } else if (names.length === 1) {
    map.fullName = names[0];
  }
  return map;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function parseParticipantCsv(buffer: Buffer, options: ParticipantCsvOptions = {}): ParticipantCsvResult {
  const { text, encoding } = decodeCsvBuffer(buffer);
  const { delimiter, fromLine } = detectDelimiter(text);
  const defaultCountry = options.defaultCountry ? normalizeCountryValue(options.defaultCountry) : '';

  let rows: ListRow[];
  const addressList = rowsFromAddressList(text);
  if (addressList) {
    rows = addressList;
  } else {
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
    rows = records.map(({ info, record }) => ({ line: info.lines, cells: record.map(clean) }));
  }

  const empty: ParticipantCsvResult = {
    participants: [],
    skipped: [],
    columns: [],
    missingColumns: ['firstName', 'lastName', 'email', 'country'],
    delimiter,
    encoding,
    headerless: false,
  };
  if (rows.length === 0) return empty;

  // A header row never holds an email address. When the first row does, the list has no header
  // (pasted from a sheet or a message) and the columns are recognised by what is in them.
  const holdsEmail = (cells: string[]) => cells.some((c) => EMAIL_RE.test(c.replace(/^mailto:/i, '')) || (EMAIL_INSIDE.test(c) && !c.includes(delimiter)));
  const headerless = !!addressList || holdsEmail(rows[0].cells);

  let map: ColumnMap;
  let columns: string[] = [];
  let dataRows: ListRow[];
  if (addressList) {
    dataRows = rows;
    map = ADDRESS_LIST_COLUMNS;
  } else if (headerless) {
    dataRows = rows.map((r) => ({ line: r.line, cells: splitAroundEmail(r.cells) }));
    map = mapColumnsByContent(dataRows.map((r) => r.cells)) ?? {};
  } else {
    // The header is usually the first row, but hand-made sheets often have a title above it
    const coverage = (m: ColumnMap) =>
      (m.firstName !== undefined || m.fullName !== undefined ? 1 : 0) +
      (m.lastName !== undefined || m.fullName !== undefined ? 1 : 0) +
      (m.email !== undefined ? 1 : 0) +
      (m.country !== undefined ? 1 : 0);
    let headerIndex = 0;
    let bestCoverage = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const c = coverage(mapColumns(rows[i].cells));
      if (c > bestCoverage) {
        headerIndex = i;
        bestCoverage = c;
      }
      if (c === 4) break;
    }
    const headers = rows[headerIndex].cells;
    columns = headers.filter((h) => h !== '');
    map = mapColumns(headers);
    dataRows = rows.slice(headerIndex + 1);
  }

  const missingColumns: ParticipantField[] = [];
  if (map.firstName === undefined && map.fullName === undefined) missingColumns.push('firstName');
  if (map.lastName === undefined && map.fullName === undefined) missingColumns.push('lastName');
  if (map.email === undefined) missingColumns.push('email');
  // Without a country column, one country for the whole list will do
  if (map.country === undefined && !defaultCountry) missingColumns.push('country');

  const participants: CsvParticipant[] = [];
  const skipped: CsvSkippedRow[] = [];
  if (missingColumns.length > 0) {
    return { participants, skipped, columns, missingColumns, delimiter, encoding, headerless };
  }

  const seen = new Map<string, number>();
  for (const { line: row, cells } of dataRows) {
    const get = (i: number | undefined) => (i === undefined ? '' : clean(cells[i]));

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

    // Excel keeps formatted-but-empty rows as ";;;" — ignore rows without any participant data
    if (!firstName && !lastName && !email && !get(map.country)) continue;

    const country = normalizeCountryValue(get(map.country)) || defaultCountry;

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

  return { participants, skipped, columns, missingColumns, delimiter, encoding, headerless };
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
