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

/** פיצול שורת שם: "כהן דני" / "כהן, דני" / "כהן<TAB>דני<TAB>ז1" */
export function parseStudentLine(line: string): { last: string; first: string; cls: string | null } | null {
  const t = line.trim();
  if (!t) return null;
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
