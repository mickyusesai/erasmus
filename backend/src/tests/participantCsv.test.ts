import { describe, it, expect } from 'vitest';
import { parseParticipantCsv, alignCountry, normalizeCountryValue, detectDelimiter } from '../utils/participantCsv.js';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const rows = [
  ['first_name', 'last_name', 'email', 'country'],
  ['Niccolò', 'Bianchi', 'niccolo@example.com', 'Italy'],
  ['Agnès', 'Dupont', 'Agnes@Example.com', 'France'],
];
const csv = (sep: string, data: string[][] = rows) => data.map((r) => r.join(sep)).join('\r\n') + '\r\n';
const names = (buf: Buffer) => parseParticipantCsv(buf).participants.map((p) => `${p.firstName} ${p.lastName}`);

describe('participant CSV: files as spreadsheet apps save them', () => {
  it('reads the untouched template (commas, UTF-8)', () => {
    const r = parseParticipantCsv(Buffer.from(csv(',')));
    expect(r.participants).toHaveLength(2);
    expect(r.delimiter).toBe(',');
    expect(r.participants[1].email).toBe('agnes@example.com'); // lower-cased
    expect(r.participants[0].row).toBe(2);
  });

  it('reads Excel "CSV UTF-8" with Italian settings (byte-order mark + semicolons)', () => {
    const r = parseParticipantCsv(Buffer.concat([BOM, Buffer.from(csv(';'))]));
    expect(r.delimiter).toBe(';');
    expect(names(Buffer.concat([BOM, Buffer.from(csv(';'))]))).toEqual(['Niccolò Bianchi', 'Agnès Dupont']);
  });

  it('reads Excel classic CSV with Italian settings (Windows-1252 + semicolons) without garbling accents', () => {
    const r = parseParticipantCsv(Buffer.from(csv(';'), 'latin1'));
    expect(r.encoding).toBe('windows-1252');
    expect(r.participants.map((p) => p.firstName)).toEqual(['Niccolò', 'Agnès']);
  });

  it('reads Excel "CSV UTF-8" with English settings (byte-order mark + commas)', () => {
    expect(names(Buffer.concat([BOM, Buffer.from(csv(','))]))).toEqual(['Niccolò Bianchi', 'Agnès Dupont']);
  });

  it('reads Excel classic CSV with English settings (Windows-1252 + commas)', () => {
    expect(names(Buffer.from(csv(','), 'latin1'))).toEqual(['Niccolò Bianchi', 'Agnès Dupont']);
  });

  it('reads Excel "Unicode text" (UTF-16 with tabs)', () => {
    const r = parseParticipantCsv(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv('\t'), 'utf16le')]));
    expect(r.encoding).toBe('utf-16le');
    expect(r.delimiter).toBe('\t');
    expect(r.participants.map((p) => p.firstName)).toEqual(['Niccolò', 'Agnès']);
  });

  it('honours an Excel "sep=;" first line', () => {
    const r = parseParticipantCsv(Buffer.from('sep=;\r\n' + csv(';')));
    expect(r.participants).toHaveLength(2);
    expect(r.participants[0].row).toBe(3);
  });
});

describe('participant CSV: column names', () => {
  it('accepts Italian column names', () => {
    const data = [['Nome', 'Cognome', 'E-mail', 'Paese'], ['Giulia', 'Rossi', 'giulia@example.com', 'Italia']];
    const r = parseParticipantCsv(Buffer.from(csv(';', data)));
    expect(r.missingColumns).toEqual([]);
    expect(r.participants[0]).toMatchObject({ firstName: 'Giulia', lastName: 'Rossi', country: 'Italia' });
  });

  it('reads German "Name, Vorname" as surname and first name', () => {
    const data = [['Name', 'Vorname', 'E-Mail-Adresse', 'Land'], ['Weber', 'Jonas', 'jonas@example.com', 'Deutschland']];
    expect(parseParticipantCsv(Buffer.from(csv(';', data))).participants[0]).toMatchObject({ firstName: 'Jonas', lastName: 'Weber' });
  });

  it('accepts French, Spanish, Polish and English variants', () => {
    const variants = [
      ['Prénom', 'Nom', 'Courriel', 'Pays'],
      ['Nombre', 'Apellidos', 'Correo electrónico', 'País'],
      ['Imię', 'Nazwisko', 'Email', 'Kraj'],
      ['First Name', 'Last Name', 'Email address', 'Sending country'],
    ];
    for (const header of variants) {
      const r = parseParticipantCsv(Buffer.from(csv(',', [header, ['A', 'B', 'a@example.com', 'Spain']])));
      expect(r.missingColumns, header.join('|')).toEqual([]);
      expect(r.participants).toHaveLength(1);
    }
  });

  it('splits a single full-name column', () => {
    const data = [['Nome e cognome', 'Email', 'Paese'], ['Anna Maria Bianchi', 'anna@example.com', 'Italy']];
    expect(parseParticipantCsv(Buffer.from(csv(';', data))).participants[0]).toMatchObject({ firstName: 'Anna Maria', lastName: 'Bianchi' });
  });

  it('finds the header below a title row', () => {
    const text = 'Participants Green Routes;;;\r\n' + csv(';');
    const r = parseParticipantCsv(Buffer.from(text));
    expect(r.participants).toHaveLength(2);
    expect(r.participants[0].row).toBe(3);
  });

  it('reports which columns are missing instead of silently finding nobody', () => {
    const data = [['first_name', 'last_name', 'country'], ['A', 'B', 'Spain']];
    const r = parseParticipantCsv(Buffer.from(csv(',', data)));
    expect(r.participants).toEqual([]);
    expect(r.missingColumns).toEqual(['email']);
    expect(r.columns).toEqual(['first_name', 'last_name', 'country']);
  });
});

describe('participant CSV: rows', () => {
  it('explains every skipped row and ignores empty spreadsheet rows', () => {
    const data = [
      ['first_name', 'last_name', 'email', 'country'],
      ['Ana', 'Lopez', 'ana@example.com', 'Spain'],
      ['', '', '', ''],
      ['Marco', 'Verdi', '', 'Italy'],
      ['Eva', 'Novak', 'eva(at)example.com', 'Slovenia'],
      ['Ana', 'Lopez', 'ANA@example.com', 'Spain'],
    ];
    const r = parseParticipantCsv(Buffer.from(csv(';', data)));
    expect(r.participants.map((p) => p.firstName)).toEqual(['Ana']);
    expect(r.skipped).toEqual([
      { row: 4, reason: 'missing email' },
      { row: 5, reason: '"eva(at)example.com" is not a valid email address' },
      { row: 6, reason: 'ana@example.com is already on row 2' },
    ]);
  });

  it('keeps quoted values with separators intact', () => {
    const text = 'first_name,last_name,email,country\r\n"Maria, Jr.",Garcia,maria@example.com,"Korea, Republic of"\r\n';
    expect(parseParticipantCsv(Buffer.from(text)).participants[0]).toMatchObject({ firstName: 'Maria, Jr.', country: 'Korea, Republic of' });
  });

  it('does not mistake an unquoted comma in a semicolon file for the separator', () => {
    const text = 'first_name;last_name;email;country\r\nAna;Lopez;ana@example.com;Spain\r\nLuca;Neri;luca@example.com;Rome, Italy\r\n';
    expect(detectDelimiter(text).delimiter).toBe(';');
  });
});

describe('participant CSV: country spelling', () => {
  it('tidies all-caps and all-lowercase country names', () => {
    expect(normalizeCountryValue('ITALY')).toBe('Italy');
    expect(normalizeCountryValue('bosnia and herzegovina')).toBe('Bosnia and Herzegovina');
    expect(normalizeCountryValue('UK')).toBe('UK');
    expect(normalizeCountryValue('Czech Republic')).toBe('Czech Republic');
  });

  it('reuses the project spelling so no duplicate country rows appear', () => {
    const known = ['Italy', 'Türkiye'];
    expect(alignCountry('italy', known)).toBe('Italy');
    expect(alignCountry('Turkiye', known)).toBe('Türkiye');
    expect(alignCountry('Spain', known)).toBe('Spain');
    expect(alignCountry('SPAIN', known)).toBe('Spain');
    expect(known).toEqual(['Italy', 'Türkiye', 'Spain']);
  });
});
