import { useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Minus, Pencil, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { OT_FIRST, OT_LABELS, STAY_BASE, beforeFirst, bump, canSendReport, countersOf, monthLabel, monthOf, sendableFrom, shiftMonth, toRow, type OtCounters } from '../../lib/overtime';
import { OvertimeReportModal } from './OvertimeReport';

/** כרטיס "שעות נוספות" במסך הבית: שלושה מונים נפרדים לחודש (פרונטליות, פרטני, שהייה), עריכה בלחיצות +/− ושמירה אחת, ושליחת דיווח במייל. */
export function OvertimeCard() {
  const store = useStore();
  const [ym, setYm] = useState(() => { const m = monthOf(new Date()); return beforeFirst(m) ? OT_FIRST : m; });
  const [draft, setDraft] = useState<OtCounters | null>(null);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState(false);
  const sendable = canSendReport(ym);
  const { c: saved, legacy } = countersOf(store.db.overtime_hours, ym);
  const value = draft ?? saved;
  const editing = draft !== null;
  const go = (d: number) => setYm((cur) => shiftMonth(cur, d));
  const save = async () => {
    if (draft === null) return;
    if (draft.frontal === saved.frontal && draft.individual === saved.individual && draft.stay === saved.stay && legacy === 0 && store.db.overtime_hours.some((r) => r.year === ym.year && r.month === ym.month)) { setDraft(null); return; }
    setBusy(true);
    try { await store.save('overtime_hours', [toRow(ym, draft)]); setDraft(null); }
    catch { /* ההודעה מוצגת בבאנר השגיאות הכללי; נשארים במצב עריכה כדי לא לאבד את השינוי */ }
    setBusy(false);
  };
  return (
    <section className="card" aria-label="שעות נוספות">
      <div className="ot-head">
        <h2>שעות נוספות</h2>
        {!editing && <button className="btn sm" onClick={() => setDraft(saved)}><Pencil size={14} aria-hidden />עריכה</button>}
      </div>
      <div className="ot-month">
        <button className="icon-btn" aria-label="החודש הקודם" disabled={editing || beforeFirst(ym)} onClick={() => go(-1)}><ChevronRight size={20} aria-hidden /></button>
        <span aria-live="polite">{monthLabel(ym)}</span>
        <button className="icon-btn" aria-label="החודש הבא" disabled={editing} onClick={() => go(1)}><ChevronLeft size={20} aria-hidden /></button>
      </div>
      <div className="ot-rows">
        {(['frontal', 'individual', 'stay'] as const).map((k) => (
          <div className="ot-row" key={k}>
            <span>{OT_LABELS[k]}{k === 'stay' && <small className="muted"> (מינימום {STAY_BASE})</small>}</span>
            <span className="ot-ctl">
              {editing && <button className="ot-step" aria-label={`הוסף שעה: ${OT_LABELS[k]}`} onClick={() => setDraft({ ...value, [k]: bump(value[k], 1) })}><Plus size={20} aria-hidden /></button>}
              <strong className="val" data-testid={`ot-${k}`}>{value[k]}</strong>
              {editing && <button className="ot-step" aria-label={`הפחת שעה: ${OT_LABELS[k]}`} disabled={value[k] <= (k === 'stay' ? STAY_BASE : 0)} onClick={() => setDraft({ ...value, [k]: bump(value[k], -1, k === 'stay' ? STAY_BASE : 0) })}><Minus size={20} aria-hidden /></button>}
            </span>
          </div>
        ))}
      </div>
      {legacy > 0 && !editing && <p className="muted small" style={{ margin: '8px 0 0' }}>החודש הזה נרשם בעבר כ-{legacy} שעות ללא פירוט. הספירה כאן מתחילה מחדש.</p>}
      {editing
        ? <div className="ot-actions"><button className="btn primary" disabled={busy} onClick={save}>שמור</button><button className="btn" disabled={busy} onClick={() => setDraft(null)}>ביטול</button></div>
        : <div className="ot-actions"><button className="btn" disabled={!sendable} onClick={() => setMail(true)}><Mail size={16} aria-hidden />שלח דיווח במייל</button></div>}
      {!editing && !sendable && <p className="muted small" style={{ margin: '8px 0 0' }}>אפשר לשלוח את הדיווח של {monthLabel(ym)} החל מ-{sendableFrom(ym)}.</p>}
      {mail && <OvertimeReportModal ym={ym} counters={saved} onClose={() => setMail(false)} />}
    </section>
  );
}
