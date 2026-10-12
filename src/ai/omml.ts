// LaTeX → OMML (Office Math Markup Language): משוואות Word אמיתיות וניתנות לעריכה.
import { parseTex, type MNode } from './math';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math" w:cs="Cambria Math"/></w:rPr>';
const run = (t: string, rPr = '') => `<m:r>${rPr}${FONT}<m:t xml:space="preserve">${esc(t)}</m:t></m:r>`;
const NOR = '<m:rPr><m:nor/></m:rPr>';
const STY_P = '<m:rPr><m:sty m:val="p"/></m:rPr>';
const arg = (tag: string, n: MNode | MNode[]) => `<m:${tag}>${(Array.isArray(n) ? n : [n]).map(om).join('')}</m:${tag}>`;
const flat = (n: MNode): MNode[] => (n.t === 'row' ? n.c : [n]);

function om(n: MNode): string {
  switch (n.t) {
    case 'mn': return run(n.v);
    case 'mi': return run(n.v, n.normal ? STY_P : '');
    case 'mo': return run(n.v);
    case 'mtext': return run(n.v, NOR).replace(FONT, '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>');
    case 'row': return n.c.map(om).join('');
    case 'sup':
      if (n.b.t === 'sub') return `<m:sSubSup>${arg('e', flat(n.b.b))}${arg('sub', flat(n.b.e))}${arg('sup', flat(n.e))}</m:sSubSup>`;
      return `<m:sSup>${arg('e', flat(n.b))}${arg('sup', flat(n.e))}</m:sSup>`;
    case 'sub':
      if (n.b.t === 'sup') return `<m:sSubSup>${arg('e', flat(n.b.b))}${arg('sub', flat(n.e))}${arg('sup', flat(n.b.e))}</m:sSubSup>`;
      return `<m:sSub>${arg('e', flat(n.b))}${arg('sub', flat(n.e))}</m:sSub>`;
    case 'frac': return `<m:f><m:fPr><m:type m:val="bar"/></m:fPr>${arg('num', flat(n.n))}${arg('den', flat(n.d))}</m:f>`;
    case 'sqrt': return n.deg
      ? `<m:rad><m:radPr/>${arg('deg', flat(n.deg))}${arg('e', flat(n.a))}</m:rad>`
      : `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${arg('e', flat(n.a))}</m:rad>`;
    case 'over': return n.kind === 'bar'
      ? `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr>${arg('e', flat(n.b))}</m:bar>`
      : `<m:acc><m:accPr><m:chr m:val="${esc(n.m)}"/></m:accPr>${arg('e', flat(n.b))}</m:acc>`;
    case 'space': return run(n.w === '1em' ? ' ' : ' ');
    case 'empty': return '';
  }
}
/** משוואה בתוך שורה */
export const texToOmml = (tex: string): string => `<m:oMath>${parseTex(tex).map(om).join('')}</m:oMath>`;
/** משוואה בפסקה נפרדת (ממורכזת) */
export const texToOmmlPara = (tex: string): string => `<m:oMathPara><m:oMath>${parseTex(tex).map(om).join('')}</m:oMath></m:oMathPara>`;
