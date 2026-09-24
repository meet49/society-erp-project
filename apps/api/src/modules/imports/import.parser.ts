import ExcelJS from 'exceljs';
import { Errors } from '../../lib/errors';

export interface ParsedSheet { headers: string[]; rows: string[][] }

/** RFC-4180-ish CSV parser: quoted fields, doubled quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('hyperlink' in v) return String((v as any).text ?? v.hyperlink);
    return '';
  }
  return String(v);
};

/** Reads the first sheet of an .xlsx or a .csv buffer into headers + string rows. */
export async function parseSheet(buffer: Buffer, fileName: string, mimeType: string): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  if (!/\.(csv|txt|xlsx)$/.test(lower)) throw Errors.validation({ file: ['Upload a .csv or .xlsx file'] });
  let table: string[][];
  if (lower.endsWith('.xlsx') || mimeType.includes('spreadsheetml')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws) throw Errors.validation({ file: ['The workbook has no sheets'] });
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as ExcelJS.CellValue[];
      const cells: string[] = [];
      for (let c = 1; c < Math.max(values.length, 1); c += 1) cells.push(cellText(values[c]).trim());
      if (cells.some((c) => c !== '')) table.push(cells);
    });
  } else if (lower.endsWith('.csv') || lower.endsWith('.txt') || mimeType.includes('csv') || mimeType.includes('text/plain')) {
    table = parseCsv(buffer.toString('utf8')).map((r) => r.map((c) => c.trim()));
  } else {
    throw Errors.validation({ file: ['Upload a .csv or .xlsx file'] });
  }
  if (!table.length) throw Errors.validation({ file: ['The file is empty'] });
  const headers = table[0].map((h, i) => (h || `Column ${i + 1}`).trim());
  const rows = table.slice(1).map((r) => headers.map((_, i) => r[i] ?? ''));
  return { headers, rows };
}

/** Normalises a header for fuzzy matching against field keys and labels. */
export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
