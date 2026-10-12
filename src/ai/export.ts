// ייצוא תשובות העוזר: DOCX עם משוואות Word אמיתיות (OMML), דף HTML עצמאי (MathML), והעתקה עשירה.
// הכול בלקוח, בלי ספריות. הטקסט תמיד עובר escape.
import { texToMathML, texToPlain } from './math';
import { texToOmml, texToOmmlPara } from './omml';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ───────── Markdown → מבנה ─────────
export type Inl = { k: 'text' | 'b' | 'i' | 'code'; v: string } | { k: 'math'; v: string };
export type Blk =
  | { k: 'h'; level: number; c: Inl[] } | { k: 'p'; lines: Inl[][] } | { k: 'list'; ordered: boolean; items: Inl[][] }
  | { k: 'table'; head: Inl[][]; rows: Inl[][][] } | { k: 'code'; v: string } | { k: 'math'; v: string };

export function inlines(text: string): Inl[] {
  const out: Inl[] = []; let rest = text;
  const re = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push({ k: 'text', v: rest }); break; }
    if (m.index) out.push({ k: 'text', v: rest.slice(0, m.index) });
    const t = m[0];
    if (t.startsWith('$$')) out.push({ k: 'math', v: t.slice(2, -2) });
    else if (t.startsWith('$')) out.push({ k: 'math', v: t.slice(1, -1) });
    else if (t.startsWith('**')) out.push({ k: 'b', v: t.slice(2, -2) });
    else if (t.startsWith('`')) out.push({ k: 'code', v: t.slice(1, -1) });
    else out.push({ k: 'i', v: t.slice(1, -1) });
    rest = rest.slice(m.index + t.length);
  }
  return out;
}

export function parseMd(text: string): Blk[] {
  const src = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, t) => `\n$$${t.trim()}$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, t) => `$${t.trim()}$`);
  const lines = src.split('\n'); const out: Blk[] = []; let i = 0;
  const LI = /^\s*([-*•]|\d+[.)])\s+(.*)$/;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (ln.trim().startsWith('$$') && !(ln.trim().length > 4 && ln.trim().endsWith('$$'))) {
      let buf = ln.trim().slice(2); i++;
      while (i < lines.length && !lines[i].includes('$$')) buf += ' ' + lines[i++];
      if (i < lines.length) { buf += ' ' + lines[i].slice(0, lines[i].indexOf('$$')); i++; }
      out.push({ k: 'math', v: buf }); continue;
    }
    if (/^\s*\$\$[\s\S]+\$\$\s*$/.test(ln)) { out.push({ k: 'math', v: ln.trim().slice(2, -2) }); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln);
    if (h) { out.push({ k: 'h', level: h[1].length, c: inlines(h[2]) }); i++; continue; }
    if (ln.trim().startsWith('```')) { const code: string[] = []; i++; while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]); i++; out.push({ k: 'code', v: code.join('\n') }); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (s: string) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inlines(c.trim()));
      const head = cells(ln); i += 2; const rows: Inl[][][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push({ k: 'table', head, rows }); continue;
    }
    const li = LI.exec(ln);
    if (li) {
      const ordered = /\d/.test(li[1]); const items: Inl[][] = [];
      while (i < lines.length) { const m = LI.exec(lines[i]); if (!m || /\d/.test(m[1]) !== ordered) break; items.push(inlines(m[2])); i++; }
      out.push({ k: 'list', ordered, items }); continue;
    }
    const para: string[] = [ln]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s|\s*\||```|\s*\$\$)/.test(lines[i])) para.push(lines[i++]);
    out.push({ k: 'p', lines: para.map(inlines) });
  }
  return out;
}

// ───────── HTML ─────────
const htmlInl = (c: Inl[]): string => c.map((x) => x.k === 'math' ? `<span class="m">${texToMathML(x.v)}</span>` : x.k === 'b' ? `<strong>${htmlInl(inlines(x.v))}</strong>` : x.k === 'i' ? `<em>${htmlInl(inlines(x.v))}</em>` : x.k === 'code' ? `<code>${esc(x.v)}</code>` : esc(x.v)).join('');
export function blocksToHtml(blocks: Blk[]): string {
  return blocks.map((b) => {
    switch (b.k) {
      case 'h': return `<h${Math.min(4, b.level + 1)}>${htmlInl(b.c)}</h${Math.min(4, b.level + 1)}>`;
      case 'p': return `<p>${b.lines.map(htmlInl).join('<br>')}</p>`;
      case 'list': return `<${b.ordered ? 'ol' : 'ul'}>${b.items.map((x) => `<li>${htmlInl(x)}</li>`).join('')}</${b.ordered ? 'ol' : 'ul'}>`;
      case 'table': return `<table><thead><tr>${b.head.map((c) => `<th>${htmlInl(c)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${htmlInl(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      case 'code': return `<pre dir="ltr"><code>${esc(b.v)}</code></pre>`;
      case 'math': return `<div class="mb">${texToMathML(b.v, true)}</div>`;
    }
  }).join('\n');
}
/** קטע HTML להדבקה (ללוח) */
export const mdToHtmlFragment = (md: string) => `<div dir="rtl" lang="he">${blocksToHtml(parseMd(md))}</div>`;
/** מסמך HTML עצמאי להורדה/הדפסה */
export function mdToHtmlPage(md: string, title: string): string {
  return `<!doctype html>\n<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:Arial,"Segoe UI",sans-serif;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.7;color:#1a1a1a}h2,h3,h4,h5{margin:1.2em 0 .4em}table{border-collapse:collapse;margin:12px 0;width:100%}th,td{border:1px solid #bbb;padding:6px 10px;text-align:start}th{background:#f1f1f1}code{background:#f3f3f3;padding:0 4px;border-radius:4px}pre{background:#f3f3f3;padding:12px;border-radius:8px;overflow:auto}.mb{text-align:center;margin:12px 0;font-size:1.15em}.m math{font-size:1.1em}math{direction:ltr}@media print{body{margin:0}}</style></head>
<body>\n${blocksToHtml(parseMd(md))}\n</body></html>`;
}

/** טקסט פשוט וקריא (בלי LaTeX ובלי סימוני Markdown) */
export function mdToPlain(md: string): string {
  const txt = (c: Inl[]): string => c.map((x) => x.k === 'math' ? texToPlain(x.v) : x.v).join('');
  return parseMd(md).map((b) => {
    switch (b.k) {
      case 'h': return txt(b.c);
      case 'p': return b.lines.map(txt).join('\n');
      case 'list': return b.items.map((x, i) => `${b.ordered ? `${i + 1}.` : '•'} ${txt(x)}`).join('\n');
      case 'table': return [b.head, ...b.rows].map((r) => r.map(txt).join(' | ')).join('\n');
      case 'code': return b.v;
      case 'math': return texToPlain(b.v);
    }
  }).join('\n\n');
}

// ───────── DOCX ─────────
const HEB = /[֐-׿]/;
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const wr = (t: string, o: { b?: boolean; i?: boolean; code?: boolean } = {}) => t ? `<w:r><w:rPr>${o.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ''}${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}${HEB.test(t) ? '<w:rtl/>' : ''}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : '';
const wInl = (c: Inl[], o: { b?: boolean } = {}): string => c.map((x) => x.k === 'math' ? texToOmml(x.v) : x.k === 'b' ? wInl(inlines(x.v), { b: true }) : x.k === 'i' ? wr(x.v, { i: true, b: o.b }) : x.k === 'code' ? wr(x.v, { code: true }) : wr(x.v, { b: o.b })).join('');
/** סדר האלמנטים ב-pPr לפי הסכמה: pStyle, keepNext, bidi, spacing, ind, jc */
interface PO { style?: string; keepNext?: boolean; spacing?: string; ind?: string; jc?: string; ltr?: boolean }
const para = (inner: string, o: PO = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keepNext ? '<w:keepNext/>' : ''}${o.ltr ? '<w:bidi w:val="0"/>' : '<w:bidi/>'}${o.spacing ?? ''}${o.ind ?? ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${inner}</w:p>`;

export function blocksToDocxBody(blocks: Blk[]): string {
  return blocks.map((b) => {
    switch (b.k) {
      case 'h': return para(wInl(b.c, { b: true }), { style: `Heading${Math.min(3, b.level)}`, keepNext: true });
      case 'p': return para(b.lines.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + wInl(l)).join(''));
      case 'list': return b.items.map((it, i) => para(wr(b.ordered ? `${i + 1}. ` : '• ') + wInl(it), { spacing: '<w:spacing w:after="60"/>', ind: '<w:ind w:start="360" w:hanging="360"/>' })).join('');
      case 'table': {
        const cell = (c: Inl[], head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EDEDED"/>' : ''}</w:tcPr>${para(wInl(c, { b: head }), { spacing: '<w:spacing w:after="0"/>' })}</w:tc>`;
        const bd = ['top', 'start', 'bottom', 'end', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('');
        return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${bd}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${b.head.map(() => '<w:gridCol w:w="2400"/>').join('')}</w:tblGrid>`
          + `<w:tr>${b.head.map((c) => cell(c, true)).join('')}</w:tr>${b.rows.map((r) => `<w:tr>${b.head.map((_, j) => cell(r[j] ?? [], false)).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`;
      }
      case 'code': return b.v.split('\n').map((l) => para(wr(l, { code: true }), { ltr: true, spacing: '<w:spacing w:after="0"/>' })).join('');
      case 'math': return para(texToOmmlPara(b.v), { jc: 'center' });
    }
  }).join('');
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="he-IL" w:eastAsia="he-IL" w:bidi="he-IL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[1, 2, 3].map((n) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${360 - n * 60}" w:after="100"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3A5F"/><w:sz w:val="${34 - n * 4}"/><w:szCs w:val="${34 - n * 4}"/></w:rPr></w:style>`).join('')}</w:styles>`;
const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const DOCRELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

export function buildDocx(md: string, title = ''): Uint8Array {
  const body = (title ? para(wr(title, { b: true }), { style: 'Heading1' }) : '') + blocksToDocxBody(parseMd(md));
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`;
  return zip([['[Content_Types].xml', CT], ['_rels/.rels', RELS], ['word/document.xml', doc], ['word/styles.xml', STYLES], ['word/_rels/document.xml.rels', DOCRELS]]);
}

// ───────── ZIP (ללא דחיסה) ─────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files: [string, string][]): Uint8Array {
  const enc = new TextEncoder(); const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let off = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255], u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...n, ...d]);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n]));
    parts.push(local); off += local.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0)); let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
