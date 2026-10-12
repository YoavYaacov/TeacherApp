import type { Block } from '../ai/tools';
import { buildDocx, mdToHtmlFragment, mdToHtmlPage, mdToPlain } from '../ai/export';

/** Markdown מלא של הודעה: הטקסט + טבלאות/רשימות שהוצגו כבלוקים */
export function messageMarkdown(content: string, blocks: unknown[]): string {
  const extra = (blocks as Block[]).map((b) => {
    if (b.type === 'table') return [b.title ? `### ${b.title}` : '', `| ${b.columns.join(' | ')} |`, `|${b.columns.map(() => '---').join('|')}|`, ...b.rows.map((r) => `| ${r.join(' | ')} |`), b.note ?? ''].filter(Boolean).join('\n');
    if (b.type === 'list') return [b.title ? `### ${b.title}` : '', ...b.items.map((x) => `- ${x}`)].filter(Boolean).join('\n');
    return '';
  }).filter(Boolean);
  return [content, ...extra].join('\n\n');
}
const stamp = () => new Date().toISOString().slice(0, 10);
function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const downloadDocx = (md: string, title = 'teacherapp-answer') => save(`${title}-${stamp()}.docx`, buildDocx(md, '') as unknown as BlobPart, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
export const downloadHtml = (md: string, title = 'teacherapp-answer') => save(`${title}-${stamp()}.html`, mdToHtmlPage(md, 'תשובת העוזר'), 'text/html;charset=utf-8');
/** העתקה עשירה: HTML עם נוסחאות MathML + טקסט קריא בלי LaTeX. מחזיר 'rich' או 'plain' לפי מה שהדפדפן אפשר */
export async function copyRich(md: string): Promise<'rich' | 'plain'> {
  const plain = mdToPlain(md);
  const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (CI && navigator.clipboard?.write) {
    try { await navigator.clipboard.write([new CI({ 'text/html': new Blob([mdToHtmlFragment(md)], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]); return 'rich'; } catch { /* נפילה לטקסט */ }
  }
  await navigator.clipboard.writeText(plain); return 'plain';
}
