import { describe, expect, it } from 'vitest';
import { buildDocx, mdToHtmlPage, mdToHtmlFragment, mdToPlain, parseMd, zip } from './export';
import { texToOmml, texToOmmlPara } from './omml';

const text = (u: Uint8Array) => new TextDecoder().decode(u);
describe('OMML', () => {
  it('שבר, חזקה, שורש, אינדקס, קו עליון', () => {
    expect(texToOmml('\\frac{a}{b}')).toContain('<m:f><m:fPr><m:type m:val="bar"/></m:fPr><m:num>');
    expect(texToOmml('x^{2}')).toContain('<m:sSup><m:e>');
    expect(texToOmml('x_1')).toContain('<m:sSub>');
    expect(texToOmml('x_1^2')).toContain('<m:sSubSup>');
    expect(texToOmml('\\sqrt{3}')).toContain('<m:degHide m:val="1"/>');
    expect(texToOmml('\\sqrt[3]{8}')).toContain('<m:deg><m:r>');
    expect(texToOmml('\\overline{AB}')).toContain('<m:bar>');
    expect(texToOmml('\\vec{v}')).toContain('<m:chr m:val="→"/>');
    expect(texToOmml('\\sin x')).toContain('<m:sty m:val="p"/>');
  });
  it('בטוח: אין הזרקה, ולא קורס על קלט שבור', () => {
    const o = texToOmml('<b>&'); expect(o).toContain('&lt;'); expect(o).toContain('&amp;'); expect(o).not.toContain('<b>');
    for (const t of ['\\frac{1}', '{', '^', '\\', 'x^', '\\left(', '\\sqrt']) expect(() => texToOmmlPara(t)).not.toThrow();
  });
});
describe('פירוק Markdown', () => {
  it('כותרות, רשימות, טבלה, קוד ונוסחה בבלוק', () => {
    const b = parseMd('## כותרת\nטקסט $x$\n\n- א\n- ב\n\n1. אחד\n\n| a | b |\n|---|---|\n| 1 | $\\frac{1}{2}$ |\n\n$$x=1$$\n\n```\ncode\n```');
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'list', 'list', 'table', 'math', 'code']);
  });
  it('סימוני \\( \\) ו-\\[ \\] מנורמלים', () => {
    expect(parseMd('כאן \\(x+1\\) וגם\n\\[ y=2 \\]').map((x) => x.k)).toEqual(['p', 'math']);
  });
});
describe('DOCX', () => {
  const md = '## פתרון\nנתון $x^{2}-4=0$ ולכן:\n\n$$x=\\pm\\sqrt{4}$$\n\n- **סעיף א׳** $\\frac{1}{2}$\n\n| a | b |\n|---|---|\n| 1 | 2 |';
  const bytes = buildDocx(md, 'כותרת');
  const raw = text(bytes);
  it('חבילת ZIP תקינה עם החלקים הנדרשים', () => {
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b);
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) expect(raw).toContain(n);
    expect(raw).toContain('PK\u0005\u0006'); // סוף ספריית ZIP
  });
  it('משוואות אמיתיות, עברית מימין לשמאל, כותרת וטבלה', () => {
    expect(raw).toContain('<m:oMath>'); expect(raw).toContain('<m:oMathPara>'); expect(raw).toContain('<m:rad>'); expect(raw).toContain('<m:f>');
    expect(raw).toContain('<w:bidi/>'); expect(raw).toContain('<w:rtl/>'); expect(raw).toContain('w:val="Heading2"'); expect(raw).toContain('<w:tbl>'); expect(raw).toContain('<w:bidiVisual/>');
    expect(raw).toContain('פתרון');
  });
  it('לא מכיל LaTeX גולמי', () => { expect(raw).not.toContain('\\frac'); expect(raw).not.toContain('\\sqrt'); });
  it('CRC תקין לכל קובץ (בדיקה מול zlib של Node)', async () => {
    const { crc32 } = await import('node:zlib'); if (!crc32) return; // Node ישן
    const z = zip([['a.txt', 'שלום']]); const dv = new DataView(z.buffer);
    expect(dv.getUint32(14, true)).toBe(crc32(new TextEncoder().encode('שלום')));
  });
});
describe('HTML והעתקה', () => {
  it('דף עצמאי עם MathML, RTL ובלי הזרקה', () => {
    const h = mdToHtmlPage('## כותרת <script>\n$\\frac{1}{2}$\n\n$$x^2$$', 'כותרת');
    expect(h).toContain('dir="rtl"'); expect(h).toContain('<mfrac>'); expect(h).toContain('display="block"'); expect(h).not.toContain('<script>'); expect(h).toContain('&lt;script&gt;');
  });
  it('קטע להדבקה וטקסט פשוט בלי LaTeX', () => {
    expect(mdToHtmlFragment('$x^2$')).toContain('<msup>');
    const p = mdToPlain('## פתרון\n$\\frac{1}{2}x^{2}$ ו-$\\sqrt{3}$\n- א');
    expect(p).not.toContain('\\'); expect(p).toContain('(1)/(2)x^2'); expect(p).toContain('√(3)'); expect(p).toContain('• א');
  });
});
