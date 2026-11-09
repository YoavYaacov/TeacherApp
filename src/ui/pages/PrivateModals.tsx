import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Modal } from '../Modal';
import { DAY_NAMES, DEFAULT_AVAIL, check, durLabel, fmtMin, isPlaced, parseHM, removeItem, unplace, upsertItem, type Kind, type PlanItem, type PrivatePlan, type Span } from '../../lib/privatePlan';

const DURS = [30, 45, 60, 75, 90, 105, 120, 150, 180];

/** שיבוץ / עריכה: שם, יום, שעה, משך, קבוע או אופציונלי. בית ספר חוסם; חפיפה או חריגה מהזמינות דורשות אישור מפורש. */
export function ItemModal({ plan, school, id, preset, onSave, onClose, newId }: { plan: PrivatePlan; school: Record<number, Span[]>; id?: string; preset?: { day: number; start: number }; onSave: (p: PrivatePlan) => void; onClose: () => void; newId: () => string }) {
  const item = id ? plan.items.find((i) => i.id === id) : undefined;
  const [name, setName] = useState(item?.name ?? '');
  const [day, setDay] = useState<string>(item?.day != null ? String(item.day) : preset ? String(preset.day) : '');
  const [time, setTime] = useState(item?.start != null ? fmtMin(item.start) : preset ? fmtMin(preset.start) : '');
  const [dur, setDur] = useState(item?.dur ?? 60);
  const [kind, setKind] = useState<Kind>(item?.kind ?? 'fixed');
  const [note, setNote] = useState(item?.note ?? '');
  const start = parseHM(time);
  const placed = day !== '' && start !== null;
  const half = day !== '' && start === null; // יום בלי שעה תקינה
  const res = placed ? check(plan, school, { day: +day, start: start!, dur }, id) : null;
  const warn: string[] = [];
  if (res?.outside) warn.push('השעה מחוץ לחלונות הזמינות שהגדרת.');
  if (res?.clash.length) warn.push(`חופף לשיעור של ${res.clash.map((c) => `${c.name} (${fmtMin(c.start!)}–${fmtMin(c.start! + c.dur)})`).join(', ')}.`);
  const block = res?.school ? 'השעה הזו חסומה: יש בה שיעור בבית הספר.' : res?.overflow ? 'השיעור חוצה את חצות.' : half ? 'בחר שעה, או השאר את היום ריק (ממתין לשיבוץ).' : '';
  const ok = name.trim().length > 0 && !block;
  const save = () => {
    const row: PlanItem = { id: item?.id ?? newId(), name: name.trim(), day: placed ? +day : null, start: placed ? start : null, dur, kind: placed ? kind : 'fixed', ...(note.trim() ? { note: note.trim() } : {}) };
    onSave(upsertItem(plan, row));
  };
  const names = [...new Set(plan.items.map((i) => i.name))];
  const durs = DURS.includes(dur) ? DURS : [...DURS, dur].sort((a, b) => a - b);
  return (
    <Modal title={item ? (isPlaced(item) ? 'עריכת שיבוץ' : 'שיבוץ תלמיד') : 'הוספת תלמיד'} onClose={onClose}>
      <div className="form">
        <label className="field fl"><span>שם</span><input className="input" list="pv-names" value={name} autoFocus={!item} onChange={(e) => setName(e.target.value)} /></label>
        <datalist id="pv-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <div className="row">
          <label className="field fl" style={{ flex: '1 1 150px' }}><span>יום</span>
            <select className="input" value={day} onChange={(e) => setDay(e.target.value)}><option value="">ללא שעה קבועה (המתנה)</option>{DAY_NAMES.map((n, d) => <option key={d} value={d}>{n}</option>)}</select></label>
          <label className="field fl" style={{ flex: '1 1 120px' }}><span>שעה</span><input className="input" type="time" step={900} dir="ltr" value={time} disabled={day === ''} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="field fl" style={{ flex: '1 1 120px' }}><span>משך</span>
            <select className="input" value={dur} onChange={(e) => setDur(+e.target.value)}>{durs.map((d) => <option key={d} value={d}>{durLabel(d)}</option>)}</select></label>
        </div>
        {placed && <div className="seg" role="group" aria-label="סוג שיבוץ" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={kind === 'fixed'} onClick={() => setKind('fixed')}>קבוע</button>
          <button type="button" aria-pressed={kind === 'optional'} onClick={() => setKind('optional')}>אופציונלי</button>
        </div>}
        <label className="field fl"><span>{placed ? 'הערה' : 'זמינות / הערה'}</span><input className="input" value={note} maxLength={200} placeholder={placed ? '' : 'למשל: שעתיים רצופות, ראשון–חמישי 15:00–18:00'} onChange={(e) => setNote(e.target.value)} /></label>
        {block && <p className="issue" role="alert">{block}</p>}
        {!block && warn.map((w, i) => <p key={i} className="note-banner" role="status">{w}</p>)}
        <div className="row">
          <button className="btn primary" disabled={!ok} onClick={save}>{warn.length && !block ? 'שבץ בכל זאת' : 'שמור'}</button>
          <button className="btn" onClick={onClose}>ביטול</button>
          {item && isPlaced(item) && <button className="btn" onClick={() => onSave(unplace(plan, item.id))}><X size={14} aria-hidden />הסר שיבוץ</button>}
          {item && !isPlaced(item) && <button className="btn danger" onClick={() => onSave(removeItem(plan, item.id))}><Trash2 size={14} aria-hidden />מחק מהרשימה</button>}
        </div>
      </div>
    </Modal>
  );
}

/** עריכת הזמינות הכללית: לכל יום רשימת שעות התחלה; כל שעה היא חלון של שעה שבו אפשר להתחיל שיעור פרטי. */
export function AvailabilityModal({ plan, onSave, onClose }: { plan: PrivatePlan; onSave: (p: PrivatePlan) => void; onClose: () => void }) {
  const [av, setAv] = useState<Record<number, number[]>>(() => JSON.parse(JSON.stringify(plan.avail)));
  const [adding, setAdding] = useState<Record<number, string>>({});
  const add = (d: number) => { const m = parseHM(adding[d] ?? ''); if (m === null) return; setAv((a) => ({ ...a, [d]: [...new Set([...(a[d] ?? []), m])].sort((x, y) => x - y) })); setAdding((x) => ({ ...x, [d]: '' })); };
  const del = (d: number, m: number) => setAv((a) => ({ ...a, [d]: (a[d] ?? []).filter((x) => x !== m) }));
  return (
    <Modal title="הזמינות לשיעורים פרטיים" onClose={onClose} wide>
      <p className="muted">כל שעה היא תחילת חלון של שעה שבו אפשר לקבוע שיעור פרטי. אפשר גם חצאי שעה ורבעי שעה, למשל 13:30.</p>
      <div className="pv-avail">
        {DAY_NAMES.map((n, d) => (
          <div key={d} className="pv-avail-day">
            <strong>{n}</strong>
            <div className="pv-chips">
              {(av[d] ?? []).length === 0 && <span className="muted">לא זמין</span>}
              {(av[d] ?? []).map((m) => <span key={m} className="pv-chip">{fmtMin(m)}<button aria-label={`הסר ${fmtMin(m)} ב${n}`} onClick={() => del(d, m)}><X size={12} /></button></span>)}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" type="time" step={900} dir="ltr" aria-label={`שעה להוספה ב${n}`} value={adding[d] ?? ''} onChange={(e) => setAdding((x) => ({ ...x, [d]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(d); }} />
              <button className="btn sm" disabled={parseHM(adding[d] ?? '') === null} onClick={() => add(d)}>הוסף</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={() => onSave({ ...plan, avail: av })}>שמור</button>
        <button className="btn" onClick={onClose}>ביטול</button>
        <button className="btn" onClick={() => setAv(JSON.parse(JSON.stringify(DEFAULT_AVAIL)))}>שחזר ברירת מחדל</button>
      </div>
    </Modal>
  );
}
