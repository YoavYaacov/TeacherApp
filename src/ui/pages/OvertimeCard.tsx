import { useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Pencil, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { bump, monthLabel, monthOf, otOf, shiftMonth, type OtKind } from '../../lib/overtime';

const KINDS: [OtKind, string][] = [['frontal_hours', 'הוראה פרונטלית'], ['pedagogical_hours', 'עבודה פדגוגית']];

/** כרטיס "שעות נוספות" במסך הבית: רשומה אחת לחודש, עריכה בלחיצות +/− ושמירה אחת. */
export function OvertimeCard() {
  const store = useStore();
  const [ym, setYm] = useState(() => monthOf(new Date()));
  const [draft, setDraft] = useState<{ frontal_hours: number; pedagogical_hours: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = otOf(store.db.overtime_hours, ym);
  const vals = draft ?? saved;
  const editing = draft !== null;
  const go = (d: number) => setYm((cur) => shiftMonth(cur, d));
  const save = async () => {
    if (!draft) return;
    if (draft.frontal_hours === saved.frontal_hours && draft.pedagogical_hours === saved.pedagogical_hours) { setDraft(null); return; }
    setBusy(true);
    try { await store.save('overtime_hours', [{ year: ym.year, month: ym.month, ...draft }]); setDraft(null); }
    catch { /* ההודעה מוצגת בבאנר השגיאות הכללי; נשארים במצב עריכה כדי לא לאבד את השינוי */ }
    setBusy(false);
  };
  return (
    <section className="card" aria-label="שעות נוספות">
      <div className="ot-head">
        <h2>שעות נוספות</h2>
        {!editing && <button className="btn sm" onClick={() => setDraft({ ...saved })}><Pencil size={14} aria-hidden />עריכה</button>}
      </div>
      <div className="ot-month">
        <button className="icon-btn" aria-label="החודש הקודם" disabled={editing} onClick={() => go(-1)}><ChevronRight size={20} aria-hidden /></button>
        <span aria-live="polite">{monthLabel(ym)}</span>
        <button className="icon-btn" aria-label="החודש הבא" disabled={editing} onClick={() => go(1)}><ChevronLeft size={20} aria-hidden /></button>
      </div>
      <div className="ot-rows">
        {KINDS.map(([k, label]) => (
          <div key={k} className="ot-row">
            <span>{label}</span>
            <span className="ot-ctl">
              {editing && <button className="ot-step" aria-label={`הוסף שעה: ${label}`} onClick={() => setDraft({ ...vals, [k]: bump(vals[k], 1) })}><Plus size={20} aria-hidden /></button>}
              <strong className="val" data-testid={`ot-${k}`}>{vals[k]}</strong>
              {editing && <button className="ot-step" aria-label={`הפחת שעה: ${label}`} disabled={vals[k] <= 0} onClick={() => setDraft({ ...vals, [k]: bump(vals[k], -1) })}><Minus size={20} aria-hidden /></button>}
            </span>
          </div>))}
      </div>
      <div className="ot-total"><span>סה״כ החודש</span><span data-testid="ot-total">{vals.frontal_hours + vals.pedagogical_hours}</span></div>
      {editing && <div className="ot-actions">
        <button className="btn primary" disabled={busy} onClick={save}>שמור</button>
        <button className="btn" disabled={busy} onClick={() => setDraft(null)}>ביטול</button>
      </div>}
    </section>
  );
}
