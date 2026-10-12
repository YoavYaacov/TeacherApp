import { useCallback } from 'react';
import { useStore } from '../../data/store';
import { cellText, gradeTone, parseCell } from '../../lib/gradebook';
import type { StudyGroup } from '../../data/types';

/** הבהוב ירוק עדין על תא שנשמר (CSS מפעיל אותו רק כשההנפשות פעילות) */
function flash(el: HTMLElement | null) {
  const t = el?.closest('td, .final') as HTMLElement | null; if (!t) return;
  t.classList.remove('flash-ok'); void t.offsetWidth; t.classList.add('flash-ok'); setTimeout(() => t.classList.remove('flash-ok'), 900);
}
/** שמירת ציון בודד (אופטימית). מחזיר false אם הקלט לא חוקי. */
export function useGradeActions() {
  const store = useStore();
  return useCallback((studentId: string, eventId: string, attempt: 1 | 2, text: string): boolean => {
    const p = parseCell(text);
    if (p === null) return false;
    if (p === 'empty') store.delFast('grades', { event_id: eventId, student_id: studentId, attempt });
    else store.saveFast('grades', [{ event_id: eventId, student_id: studentId, attempt, status: p.status, score: p.score }]);
    return true;
  }, [store]);
}

export function GradeInput({ cur, onCommit, label, r, c, att, small }: {
  cur?: { status: string; score: number | null }; onCommit: (text: string) => boolean; label: string; r?: number; c?: number; att?: 1 | 2; small?: boolean;
}) {
  const txt = cellText(cur);
  return (
    <input key={txt} className={[small ? 'small' : '', cur?.status === 'score' ? `g-${gradeTone(Number(cur.score))}` : ''].filter((x) => x && x !== 'g-').join(' ') || undefined} defaultValue={txt} aria-label={label} inputMode="decimal"
      data-r={r} data-c={c} data-att={att} placeholder={att === 2 ? 'ב׳' : undefined}
      onBlur={(e) => { if (e.target.value === txt) return; if (onCommit(e.target.value)) flash(e.target); else e.target.value = txt; }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && r !== undefined) {
          e.preventDefault(); (e.target as HTMLInputElement).blur();
          const next = (e.target as HTMLElement).closest('table')?.querySelector<HTMLInputElement>(`input[data-r="${r + 1}"][data-c="${c}"][data-att="${att}"]`);
          next?.focus(); next?.select();
        }
      }} onFocus={(e) => e.target.select()} />
  );
}

export function FinalCell({ value, source, stale, onSet, onApprove, canApprove, label }: {
  value: number | null; source: 'approved' | 'override' | null; stale: boolean;
  onSet: (v: number | null) => void; onApprove: () => void; canApprove: boolean; label: string;
}) {
  const txt = value === null ? '' : String(value);
  return (
    <div className={`final${value !== null ? ' ok' : ''}${value !== null && gradeTone(value) ? ` ${gradeTone(value)}` : ''}${stale ? ' stale' : ''}`} title={stale ? 'המקור השתנה מאז האישור. לחץ ✓ לאישור מחדש' : source === 'override' ? 'ציון ידני' : undefined}>
      <input key={`${txt}-${source}`} defaultValue={txt} aria-label={label} inputMode="decimal"
        onBlur={(e) => {
          const t = e.target.value.trim();
          if (t === txt) return;
          if (t === '') { onSet(null); flash(e.target); return; }
          const n = Number(t.replace(',', '.'));
          if (Number.isFinite(n) && n >= 0 && n <= 100) { onSet(n); flash(e.target); } else e.target.value = txt;
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      {canApprove && <button className="btn sm" aria-label={`אשר ${label}`} title="אשר את הציון המחושב כסופי" onClick={onApprove}>✓</button>}
    </div>
  );
}

export const groupOf = (g: StudyGroup) => g;
