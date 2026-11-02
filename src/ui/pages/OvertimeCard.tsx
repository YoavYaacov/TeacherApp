import { useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, Minus, Pencil, Plus } from 'lucide-react';
import { useStore } from '../../data/store';
import { OT_FIRST, beforeFirst, bump, canSendReport, hoursOf, monthLabel, monthOf, sendableFrom, shiftMonth } from '../../lib/overtime';
import { OvertimeReportModal } from './OvertimeReport';

/** כרטיס "שעות נוספות" במסך הבית: מונה יחיד לחודש, עריכה בלחיצות +/− ושמירה אחת, ושליחת דיווח במייל. */
export function OvertimeCard() {
  const store = useStore();
  const [ym, setYm] = useState(() => { const m = monthOf(new Date()); return beforeFirst(m) ? OT_FIRST : m; });
  const [draft, setDraft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState(false);
  const sendable = canSendReport(ym);
  const saved = hoursOf(store.db.overtime_hours, ym);
  const value = draft ?? saved;
  const editing = draft !== null;
  const go = (d: number) => setYm((cur) => shiftMonth(cur, d));
  const save = async () => {
    if (draft === null) return;
    if (draft === saved) { setDraft(null); return; }
    setBusy(true);
    try { await store.save('overtime_hours', [{ year: ym.year, month: ym.month, hours: draft }]); setDraft(null); }
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
        <div className="ot-row ot-single">
          <span>סה״כ שעות החודש</span>
          <span className="ot-ctl">
            {editing && <button className="ot-step" aria-label="הוסף שעה" onClick={() => setDraft(bump(value, 1))}><Plus size={20} aria-hidden /></button>}
            <strong className="val" data-testid="ot-hours">{value}</strong>
            {editing && <button className="ot-step" aria-label="הפחת שעה" disabled={value <= 0} onClick={() => setDraft(bump(value, -1))}><Minus size={20} aria-hidden /></button>}
          </span>
        </div>
      </div>
      {editing
        ? <div className="ot-actions"><button className="btn primary" disabled={busy} onClick={save}>שמור</button><button className="btn" disabled={busy} onClick={() => setDraft(null)}>ביטול</button></div>
        : <div className="ot-actions"><button className="btn" disabled={!sendable} onClick={() => setMail(true)}><Mail size={16} aria-hidden />שלח דיווח במייל</button></div>}
      {!editing && !sendable && <p className="muted small" style={{ margin: '8px 0 0' }}>אפשר לשלוח את הדיווח של {monthLabel(ym)} החל מ-{sendableFrom(ym)}.</p>}
      {mail && <OvertimeReportModal ym={ym} hours={saved} onClose={() => setMail(false)} />}
    </section>
  );
}
