/**
 * Parses CSV (RFC 4180: quoted fields may contain commas, "" and newlines; CRLF or LF) into
 * records keyed by the header row. Blank lines are skipped; values stay strings.
 * Throws on an unterminated quote or a row with more fields than the header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, ''); // BOM, as Excel writes it

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      rows.push([...row, field]);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error('Unterminated quoted field');
  rows.push([...row, field]);

  const [header, ...records] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((k) => k.trim());
  return records.map((cells, i) => {
    if (cells.length > keys.length) throw new Error(`Row ${i + 2} has more fields than the header`);
    return Object.fromEntries(keys.map((k, j) => [k, cells[j] ?? '']));
  });
}
