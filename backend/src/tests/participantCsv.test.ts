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

describe('participant list: pasted without a header row', () => {
  const pasted = (text: string, options?: { defaultCountry?: string }) => parseParticipantCsv(Buffer.from(text, 'utf-8'), options);
  const people = (r: ReturnType<typeof parseParticipantCsv>) => r.participants.map((p) => `${p.firstName}|${p.lastName}|${p.email}|${p.country}`);

  it('reads rows copied from a sheet (tabs), recognising the columns by what is in them', () => {
    const r = pasted('Anna\tNowak\tanna@example.org\tPoland\nMarco\tBianchi\tmarco@example.org\tItaly\n');
    expect(r.headerless).toBe(true);
    expect(r.missingColumns).toEqual([]);
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland', 'Marco|Bianchi|marco@example.org|Italy']);
  });

  it('does not care in which order the columns come', () => {
    const r = pasted('Italy;marco@example.org;Marco;Bianchi\nSpain;lucia@example.org;Lucía;Fernández\n');
    expect(people(r)).toEqual(['Marco|Bianchi|marco@example.org|Italy', 'Lucía|Fernández|lucia@example.org|Spain']);
  });

  it('reads comma-separated lines with a full name', () => {
    const r = pasted('Anna Nowak, anna@example.org, Poland\nJean-Luc de Vries, jl@example.org, The Netherlands\n');
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland', 'Jean-Luc de|Vries|jl@example.org|The Netherlands']);
  });

  it('reads one person per line with only spaces in between', () => {
    const r = pasted('Anna Nowak anna@example.org Poland\nTomáš Novák tomas@example.org Czech Republic\nSara Lind Sweden sara@example.org\n');
    expect(people(r)).toEqual([
      'Anna|Nowak|anna@example.org|Poland',
      'Tomáš|Novák|tomas@example.org|Czech Republic',
      'Sara|Lind|sara@example.org|Sweden',
    ]);
  });

  it('reads the "To" line of an email, and takes the one country that was given for all', () => {
    const r = pasted('Anna Nowak <anna@example.org>; Zając, Piotr <piotr@example.org>, "Marta Ruiz" <marta@example.org>', { defaultCountry: 'poland' });
    expect(r.headerless).toBe(true);
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland', 'Piotr|Zając|piotr@example.org|Poland', 'Marta|Ruiz|marta@example.org|Poland']);
  });

  it('asks for the country when the list has none', () => {
    const r = pasted('Anna Nowak <anna@example.org>; Piotr Zając <piotr@example.org>');
    expect(r.missingColumns).toEqual(['country']);
    expect(r.participants).toEqual([]);
  });

  it('uses the given country only for rows that say none', () => {
    const r = pasted('Anna\tNowak\tanna@example.org\tPoland\nMarco\tBianchi\tmarco@example.org\t\n', { defaultCountry: 'Italy' });
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland', 'Marco|Bianchi|marco@example.org|Italy']);
  });

  it('takes the last of three other columns as the country when it is a name it does not know', () => {
    const r = pasted('Anna\tNowak\tanna@example.org\tWakanda\nMarco\tBianchi\tmarco@example.org\tWakanda\n');
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Wakanda', 'Marco|Bianchi|marco@example.org|Wakanda']);
  });

  it('does not take a surname for a country', () => {
    const r = pasted('Anna\tNowak\tanna@example.org\nMarco\tBianchi\tmarco@example.org\n');
    expect(r.missingColumns).toEqual(['country']);
    const withCountry = pasted('Anna\tNowak\tanna@example.org\nMarco\tBianchi\tmarco@example.org\n', { defaultCountry: 'Italy' });
    expect(people(withCountry)).toEqual(['Anna|Nowak|anna@example.org|Italy', 'Marco|Bianchi|marco@example.org|Italy']);
  });

  it('knows a green-travel row as a country too', () => {
    const r = pasted('Poland GREEN\tAnna\tNowak\tanna@example.org\nPoland GREEN\tPiotr\tZając\tpiotr@example.org\n');
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland GREEN', 'Piotr|Zając|piotr@example.org|Poland GREEN']);
  });

  it('still says why a row is left out', () => {
    const r = pasted('Anna\tNowak\tanna@example.org\tPoland\nMarco\tBianchi\tnot-an-email\tItaly\nAnna\tNowak\tanna@example.org\tPoland\n');
    expect(r.participants).toHaveLength(1);
    expect(r.skipped.map((s) => `${s.row}: ${s.reason}`)).toEqual(['2: "not-an-email" is not a valid email address', '3: anna@example.org is already on row 1']);
  });

  it('a file with a header row is read as before', () => {
    const r = pasted('First name,Last name,Email,Country\nAnna,Nowak,anna@example.org,Poland\n');
    expect(r.headerless).toBe(false);
    expect(r.columns).toEqual(['First name', 'Last name', 'Email', 'Country']);
    expect(people(r)).toEqual(['Anna|Nowak|anna@example.org|Poland']);
  });

  it('a header that misses a column is still reported, not read as a person', () => {
    const r = pasted('First name,Last name,Country\nAnna,Nowak,Poland\n');
    expect(r.headerless).toBe(false);
    expect(r.missingColumns).toEqual(['email']);
  });
});
