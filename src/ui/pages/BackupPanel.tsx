import { useCallback, useEffect, useState } from 'react';
import { Download, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useStore } from '../../data/store';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { TABLES, type DB } from '../../data/types';
import { TABLE_LABEL, buildEnvelope, countsOf, parseBackupFile, type ParsedBackup } from '../../lib/backup';
import { download, toCSV } from '../../lib/util';

type Counts = Record<string, number>;
interface BackupRow { id: string; created_at: string; kind: 'auto' | 'manual' | 'pre_restore'; note: string | null; counts: Counts; bytes: number }
interface Preview { ok: boolean; error?: string; inserted?: Counts; already_present?: Counts; deleted?: Counts; backup_counts?: Counts; current_counts?: Counts }
type Source = { type: 'file'; parsed: ParsedBackup; name: string } | { type: 'backup'; row: BackupRow };

const KIND: Record<BackupRow['kind'], string> = { auto: 'אוטומטי', manual: 'ידני', pre_restore: 'לפני שחזור' };
const total = (c?: Counts) => Object.values(c ?? {}).reduce((a, b) => a + b, 0);
const when = (s: string) => new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
const kb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);

export function lastFileBackup(db: DB): string | null {
  const v = db.user_settings[0]?.prefs?.lastFileBackupAt;
  return typeof v === 'string' ? v : null;
}

export function BackupPanel() {
  const store = useStore();
  const { db } = store;
  const cloud = store.kind === 'supabase' && !!supabase;
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<BackupRow[] | null>(null);
  const [listErr, setListErr] = useState('');
  const [restoring, setRestoring] = useState<Source | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);

  const refresh = useCallback(async () => {
    if (!cloud) return;
    const { data, error } = await supabase!.from('app_backups').select('id,created_at,kind,note,counts,bytes').order('created_at', { ascending: false }).limit(200);
    if (error) { setListErr(error.message); setList(null); } else { setListErr(''); setList(data as BackupRow[]); }
  }, [cloud]);
  useEffect(() => { void refresh(); }, [refresh]);

  const markFileBackup = () => {
    const cur = db.user_settings[0];
    store.saveFast('user_settings', [{ id: true, theme: cur?.theme ?? 'sky-blue', prefs: { ...(cur?.prefs ?? {}), lastFileBackupAt: new Date().toISOString() } }]);
  };

  const fileBackup = async () => {
    setBusy(true); setMsg('');
    try {
      let data: Partial<DB> = db;
      if (cloud) { // נתונים טריים מהשרת, לא ממה שבדפדפן
        const { data: res, error } = await supabase!.rpc('export_backup');
        if (error) throw new Error(error.message);
        data = (res as { data: Partial<DB> }).data;
      }
      const env = await buildEnvelope(data, cloud ? 'supabase' : 'local');
      download(`גיבוי-ניהול-הוראה-${stamp}.json`, JSON.stringify(env), 'application/json');
      markFileBackup();
      setMsg(`הגיבוי ירד למכשיר (${total(env.counts)} רשומות). הקובץ מכיל נתוני תלמידים לא מוצפנים: שמור אותו במקום פרטי ומאובטח.`);
    } catch (e) { setMsg(`הגיבוי נכשל: ${(e as Error).message}`); }
    setBusy(false);
  };

  const dbBackup = async () => {
    setBusy(true); setMsg('');
    const { error } = await supabase!.rpc('create_data_backup', { p_kind: 'manual', p_note: null });
    setMsg(error ? `יצירת הגיבוי נכשלה: ${error.message}` : 'גיבוי נוצר במסד הנתונים.');
    await refresh(); setBusy(false);
  };

  const remove = async (r: BackupRow) => {
    if (!confirm(`למחוק את הגיבוי מ-${when(r.created_at)}? לא ניתן לבטל.`)) return;
    const { error } = await supabase!.from('app_backups').delete().eq('id', r.id);
    if (error) setMsg(`המחיקה נכשלה: ${error.message}`);
    await refresh();
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg('');
    try { setRestoring({ type: 'file', parsed: await parseBackupFile(await f.text()), name: f.name }); }
    catch (e) { setMsg(`הקובץ נדחה: ${(e as Error).message}`); }
  };

  const csvAll = () => {
    const name = (id: string) => { const s = db.students.find((x) => x.id === id); return s ? `${s.last_name} ${s.first_name}` : id; };
    download(`ציונים-כל-הקבוצות-${stamp}.csv`, toCSV([['קבוצה', 'מחצית', 'תלמיד', 'אירוע', 'ניסיון', 'סטטוס', 'ציון'], ...db.grades.map((g) => { const e = db.assessment_events.find((x) => x.id === g.event_id); const gr = db.study_groups.find((x) => x.id === e?.group_id); return [gr?.name, e?.term === 1 ? 'א׳' : 'ב׳', name(g.student_id), e?.title, g.attempt, g.status, g.score]; })]));
  };

  const last = lastFileBackup(db);
  return <>
    <h2>גיבויים ונתונים</h2>
    <div className="bk-sec">
      <h3>גיבוי לקובץ</h3>
      <p className="muted">{last ? `הורדה אחרונה: ${when(last)}.` : 'עדיין לא הורדת גיבוי לקובץ.'} גיבוי במסד הנתונים לא מגן מפני מחיקת הפרויקט עצמו, ולכן מומלץ להוריד קובץ אחת לשבוע.</p>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={fileBackup}><Download size={16} aria-hidden />הורד גיבוי מלא</button>
        <label className="btn"><Upload size={16} aria-hidden />שחזור מקובץ<input type="file" accept=".json,application/json" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button className="btn" onClick={csvAll}>ייצוא ציונים (CSV)</button>
      </div>
    </div>
    {msg && <p role="status" className="bk-msg">{msg}</p>}

    {cloud && <div className="bk-sec">
      <h3>גיבויים במסד הנתונים</h3>
      <p className="muted">נוצר גיבוי אוטומטי בפתיחת האפליקציה, לכל היותר פעם ביום ורק אם הנתונים השתנו. נשמרים 30 הגיבויים האוטומטיים האחרונים; גיבוי ידני וגיבוי ״לפני שחזור״ לא נמחקים אוטומטית.</p>
      <div className="row" style={{ marginBottom: 8 }}><button className="btn" disabled={busy} onClick={dbBackup}>צור גיבוי עכשיו</button></div>
      {listErr && <p className="issue" role="alert">לא ניתן לקרוא גיבויים מהמסד ({listErr}). ייתכן שהקובץ 0002_backup_restore.sql טרם הורץ ב-Supabase.</p>}
      {list && (list.length === 0 ? <p className="muted">אין עדיין גיבויים במסד.</p> :
        <div className="card flush"><table className="dt"><thead><tr><th>תאריך</th><th>סוג</th><th>רשומות</th><th>גודל</th><th /></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}><td>{when(r.created_at)}</td><td><span className={`badge${r.kind === 'manual' ? ' ok' : ''}`}>{KIND[r.kind]}</span></td><td>{total(r.counts)}</td><td className="muted">{kb(r.bytes)}</td>
              <td className="actions"><button className="btn sm" onClick={() => setRestoring({ type: 'backup', row: r })}><RotateCcw size={14} aria-hidden />שחזר</button>
                <button className="icon-btn" aria-label="מחק גיבוי" title="מחק גיבוי" onClick={() => remove(r)}><Trash2 size={16} /></button></td></tr>))}</tbody></table></div>)}
    </div>}
    {restoring && <RestoreModal source={restoring} cloud={cloud} onClose={() => setRestoring(null)} onDone={(m) => { setMsg(m); void refresh(); }} />}
  </>;
}

function RestoreModal({ source, cloud, onClose, onDone }: { source: Source; cloud: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const store = useStore();
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [prev, setPrev] = useState<Record<string, Preview>>({});
  const [loading, setLoading] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  const args = useCallback((m: string, dry: boolean, confirmWord: string | null) => ({
    p_backup_id: source.type === 'backup' ? source.row.id : null,
    p_data: source.type === 'file' ? source.parsed.data : null,
    p_mode: m, p_dry: dry, p_confirm: confirmWord,
  }), [source]);

  useEffect(() => {
    if (!cloud) { setLoading(false); return; }
    let live = true;
    (async () => {
      const out: Record<string, Preview> = {};
      for (const m of ['merge', 'replace']) {
        const { data, error } = await supabase!.rpc('restore_backup', args(m, true, null));
        out[m] = error ? { ok: false, error: error.message } : (data as Preview);
      }
      if (live) { setPrev(out); setLoading(false); }
    })();
    return () => { live = false; };
  }, [cloud, args]);

  const label = source.type === 'file' ? `קובץ: ${source.name}` : `גיבוי מ-${when(source.row.created_at)} (${KIND[source.row.kind]})`;
  const p = prev[mode];
  const bk = source.type === 'file' ? countsOf(source.parsed.data) : source.row.counts;
  const cur = p?.current_counts ?? {};
  const word = 'החלף';
  const canGo = cloud ? !!p?.ok && (mode === 'merge' || confirmText.trim() === word) : confirmText.trim() === word;

  const run = async () => {
    setWorking(true); setErr('');
    try {
      if (cloud) {
        const { data, error } = await supabase!.rpc('restore_backup', args(mode, false, mode === 'replace' ? 'REPLACE' : null));
        if (error) throw new Error(error.message);
        const r = data as Preview & { pre_backup_id?: string };
        await store.reload();
        onDone(mode === 'merge' ? `השחזור הושלם: נוספו ${total(r.inserted)} רשומות חסרות, ${total(r.already_present)} כבר היו קיימות ולא שונו.`
          : `כל הנתונים הוחלפו בגיבוי (${total(r.inserted)} רשומות). נוצר אוטומטית גיבוי ״לפני שחזור״ ברשימה, ואפשר לחזור אליו.`);
      } else {
        if (source.type !== 'file' || !store.repo.replaceAll) throw new Error('שחזור זמין רק מקובץ במצב מקומי');
        const pre = await buildEnvelope(store.db, 'local');
        download(`גיבוי-לפני-שחזור-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(pre), 'application/json');
        await store.repo.replaceAll({ ...Object.fromEntries(TABLES.map((t) => [t, []])), ...source.parsed.data } as DB);
        await store.reload();
        onDone('הנתונים שוחזרו. קובץ גיבוי של המצב הקודם ירד למכשיר.');
      }
      onClose();
    } catch (e) { setErr((e as Error).message); setWorking(false); }
  };

  return <Modal title="שחזור נתונים" onClose={onClose} wide>
    <p><strong>{label}</strong>{source.type === 'file' && source.parsed.verified === true && <span className="badge ok" style={{ marginInlineStart: 8 }}>סכום ביקורת תקין</span>}
      {source.type === 'file' && source.parsed.verified === null && <span className="badge warn" style={{ marginInlineStart: 8 }}>קובץ ישן ללא סכום ביקורת</span>}</p>
    {cloud && <div className="seg" role="group" aria-label="מצב שחזור" style={{ marginBottom: 12 }}>
      <button aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>הוסף רק מה שחסר</button>
      <button aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>החלף הכול</button></div>}
    {!cloud && <p className="issue">במצב מקומי השחזור מחליף את כל הנתונים. לפני כן יירד קובץ גיבוי של המצב הנוכחי.</p>}
    {cloud && mode === 'merge' && <p className="muted">בטוח: מוסיף רק רשומות שאינן קיימות. שום נתון קיים לא ישונה ולא יימחק.</p>}
    {cloud && mode === 'replace' && <p className="issue">כל הנתונים הנוכחיים יוחלפו בתוכן הגיבוי. לפני כן ייווצר אוטומטית גיבוי של המצב הנוכחי, והפעולה כולה מתבצעת כיחידה אחת: או שהיא מצליחה במלואה, או שדבר לא משתנה.</p>}
    {loading ? <p className="muted">בודק מה ישתנה…</p> : cloud && p && !p.ok ? <p className="issue" role="alert">השחזור לא יכול להתבצע ולא ישנה דבר: {p.error}</p> : cloud && (
      <div className="card flush"><table className="dt"><thead><tr><th>נתונים</th><th>בגיבוי</th><th>כרגע</th><th>{mode === 'merge' ? 'יתווסף' : 'יוחלף'}</th></tr></thead>
        <tbody>{TABLES.filter((t) => (bk[t] ?? 0) > 0 || (cur[t] ?? 0) > 0).map((t) => (
          <tr key={t}><td>{TABLE_LABEL[t]}</td><td>{bk[t] ?? 0}</td><td>{cur[t] ?? 0}</td>
            <td>{mode === 'merge' ? (p?.inserted?.[t] ?? 0) : `${p?.deleted?.[t] ?? 0} ← ${p?.inserted?.[t] ?? 0}`}</td></tr>))}</tbody></table></div>)}
    {((cloud && mode === 'replace') || !cloud) && <label className="field" style={{ marginTop: 12 }}>כדי לאשר, הקלד ״{word}״
      <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></label>}
    {err && <p className="issue" role="alert">השחזור נכשל ולא שינה דבר: {err}</p>}
    <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
      <button className="btn" onClick={onClose}>ביטול</button>
      <button className="btn primary" disabled={!canGo || working || loading} onClick={run}>{working ? 'משחזר…' : mode === 'merge' && cloud ? 'הוסף את החסר' : 'בצע שחזור'}</button>
    </div>
  </Modal>;
}
