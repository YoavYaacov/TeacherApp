import { Fragment, type ReactNode } from 'react';
import { texToMathML } from '../ai/math';

/** רינדור Markdown קל + מתמטיקה (LaTeX → MathML). בלי HTML גולמי מהמודל: הכול נבנה כאלמנטי React. */
const Math = ({ tex, display }: { tex: string; display?: boolean }) => <span className={display ? 'math-block' : 'math-inline'} dir="ltr" dangerouslySetInnerHTML={{ __html: texToMathML(tex, display) }} />;

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []; let rest = text; let n = 0;
  const re = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    const t = m[0], k = `${key}${n++}`;
    if (t.startsWith('$$')) out.push(<Math key={k} tex={t.slice(2, -2)} />);
    else if (t.startsWith('$')) out.push(<Math key={k} tex={t.slice(1, -1)} />);
    else if (t.startsWith('**')) out.push(<strong key={k}>{inline(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{inline(t.slice(1, -1), k)}</em>);
    rest = rest.slice(m.index + t.length);
  }
  return out;
}

export function Markdown({ text }: { text: string }) {
  // \( \) ו-\[ \] => $ $ / $$ $$ ; מנרמל כדי שהמודל יוכל לבחור כל סגנון
  const src = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, t) => `\n$$${t.trim()}$$\n`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, t) => `$${t.trim()}$`);
  const lines = src.split('\n'); const els: ReactNode[] = []; let i = 0; let k = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    // בלוק מתמטי $$ ... $$ על שורה/שורות נפרדות
    if (ln.trim().startsWith('$$') && !(ln.trim().length > 4 && ln.trim().endsWith('$$'))) {
      let buf = ln.trim().slice(2); i++;
      while (i < lines.length && !lines[i].includes('$$')) buf += ' ' + lines[i++];
      if (i < lines.length) { buf += ' ' + lines[i].slice(0, lines[i].indexOf('$$')); i++; }
      els.push(<div key={k++} className="math-row"><Math tex={buf} display /></div>); continue;
    }
    if (/^\s*\$\$[\s\S]+\$\$\s*$/.test(ln)) { els.push(<div key={k++} className="math-row"><Math tex={ln.trim().slice(2, -2)} display /></div>); i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln);
    if (h) { const L = h[1].length; els.push(L <= 2 ? <h3 key={k++} dir="auto">{inline(h[2])}</h3> : <h4 key={k++} dir="auto">{inline(h[2])}</h4>); i++; continue; }
    if (ln.trim().startsWith('```')) { const code: string[] = []; i++; while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]); i++; els.push(<pre key={k++} dir="ltr"><code>{code.join('\n')}</code></pre>); continue; }
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      const cells = (s: string) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(ln); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      els.push(<div key={k++} className="md-table"><table className="dt"><thead><tr>{head.map((c, j) => <th key={j} dir="auto">{inline(c)}</th>)}</tr></thead><tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j} dir="auto">{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const li = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(ln);
    if (li) {
      const ordered = /\d/.test(li[1]); const items: ReactNode[] = [];
      while (i < lines.length) { const m = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(lines[i]); if (!m || /\d/.test(m[1]) !== ordered) break; items.push(<li key={items.length} dir="auto">{inline(m[2])}</li>); i++; }
      els.push(ordered ? <ol key={k++}>{items}</ol> : <ul key={k++}>{items}</ul>); continue;
    }
    const para: string[] = [ln]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s|\s*\||```|\s*\$\$)/.test(lines[i])) para.push(lines[i++]);
    els.push(<p key={k++} dir="auto">{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, `p${j}`)}</Fragment>)}</p>);
  }
  return <div className="md">{els}</div>;
}
