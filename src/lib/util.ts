export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const fmtTime = (s: string) => new Date(s).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
export const fmtDay = (s: string) => new Date(s).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' });
export const fmtDate = (s: string) => new Date(s).toLocaleDateString('he-IL');
export const hebSort = (a: string, b: string) => a.localeCompare(b, 'he');

/** נירמול כיתת אם: "ז'1", "ז 1", "ז-1", "ז1" => "ז׳1" */
export function normalizeClass(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[‘’'`"״]/g, '').replace(/[\s\-_/.]+/g, '');
  if (!s) return null;
  const m = s.match(/^([א-ת]{1,2})(\d{1,2})$/);
  if (m) s = `${m[1]}׳${m[2]}`;
  return s;
}

export interface ParsedStudent { last: string; first: string; cls: string | null; gender?: 'm' | 'f'; mashov?: boolean }

/** שורה מייצוא משו"ב: מס' | ת.ז | שם התלמיד (משפחה, פרטי, שם נוסף) | מין | שכבה | מקבילה | ...
 *  ת.ז, תאריך לידה וכתובת מתעלמים בכוונה ואינם נשמרים. */
export function parseMashovLine(line: string): ParsedStudent | null {
  const t = line.trim();
  const parts = (t.includes('\t') ? t.split('\t') : t.split(',')).map((x) => x.trim().replace(/^"|"$/g, ''));
  if (parts.length < 6 || !/^\d{1,3}$/.test(parts[0]) || !/^\d{5,9}$/.test(parts[1])) return null;
  const words = parts[2].split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  const g = parts[3];
  return { last: words[0], first: words.slice(1).join(' '), cls: normalizeClass(`${parts[4]}${parts[5]}`), gender: g === 'ז' ? 'm' : g === 'נ' ? 'f' : undefined, mashov: true };
}

/** פיצול שורת שם: "כהן דני" / "כהן, דני" / "כהן<TAB>דני<TAB>ז1", או שורת משו"ב מלאה */
export function parseStudentLine(line: string): ParsedStudent | null {
  const t = line.trim();
  if (!t) return null;
  const m = parseMashovLine(t);
  if (m) return m;
  const parts = (t.includes('\t') ? t.split('\t') : t.includes(',') || t.includes(';') ? t.split(/[,;]/) : t.split(/\s+/)).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { last: parts[0], first: parts[1], cls: normalizeClass(parts[2] ?? null) };
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
export function parseCSV(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}
export function download(name: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadBytes(name: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** תאריך עברי בגימטריה, למשל "ב׳ בחשוון תשפ״ז" (מחושב בדפדפן לפי לוח השנה העברי של המערכת; מתחלף בחצות ולא בשקיעה) */
export function hebrewDate(d: Date): string {
  const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], HUND = ['', 'ק', 'ר', 'ש', 'ת'];
  const gem = (n: number): string => {
    let s = ''; let rest = n;
    while (rest >= 400) { s += 'ת'; rest -= 400; }
    s += HUND[Math.floor(rest / 100)] ?? ''; rest %= 100;
    if (rest === 15) s += 'טו'; else if (rest === 16) s += 'טז'; else { s += TENS[Math.floor(rest / 10)]; s += ONES[rest % 10]; }
    return s.length > 1 ? `${s.slice(0, -1)}״${s.slice(-1)}` : `${s}׳`;
  };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d).map((p) => [p.type, p.value]));
  const year = Number(parts.year) % 1000;
  return `${gem(Number(parts.day))} ב${parts.month} ${gem(year)}`;
}
