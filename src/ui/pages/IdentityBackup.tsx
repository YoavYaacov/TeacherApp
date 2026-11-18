import { useCallback, useEffect, useState } from 'react';
import { daysSince, identityExport, identityImport, identityStatus, packageReason, type IdentityStatus, type PackageCheck } from '../../lib/identity';
import { download } from '../../lib/util';

/** גיבוי זהויות תלמידים: חבילה מוצפנת וחתומה לשמירה מחוץ למסד. ענן בלבד. הקובץ לא מכיל ת"ז גלויה או שמות. */
export function IdentityBackup() {
  const [st, setSt] = useState<IdentityStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkg, setPkg] = useState<{ name: string; data: unknown; check: PackageCheck } | null>(null);
  const refresh = useCallback(() => { void identityStatus().then(setSt); }, []);
  useEffect(refresh, [refresh]);
  if (!st) return null;
  const age = daysSince(st.last_export_at);

  const doExport = async () => {
    setBusy(true); setMsg('');
    try {
      const data = await identityExport();
      download(`זהויות-${new Date().toISOString().slice(0, 10)}.tzpkg.json`, JSON.stringify(data), 'application/json');
      setMsg('החבילה ירדה. שמור עד 3 חבילות אחרונות ומחק ישנות יותר. את המפתח שמור בנפרד.');
      refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(''); setPkg(null);
    try {
      const data = JSON.parse(await f.text());
      const check = await identityImport(data, false);
      if (!check.ok) setMsg(packageReason[check.reason ?? 'format']); else setPkg({ name: f.name, data, check });
    } catch { setMsg('לא ניתן לקרוא את הקובץ.'); }
  };
  const restore = async () => {
    if (!pkg) return;
    setBusy(true);
    try {
      const r = await identityImport(pkg.data, true);
      setMsg(r.ok ? `שוחזרו ${r.restored} זהויות.` : packageReason[r.reason ?? 'format']);
      setPkg(null); refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };

  return (
    <section className="card" aria-label="גיבוי זהויות">
      <h2>זהויות תלמידים</h2>
      <p className="muted">נשמרות מוצפנות בשרת. {st.total} שמורות{st.readable < st.total ? `, ${st.total - st.readable} אינן ניתנות לפענוח` : ''}.
        {age === null ? ' טרם יוצאה חבילת גיבוי.' : ` חבילה אחרונה לפני ${age} ימים.`}</p>
      {(age === null || age > 30) && st.total > 0 && <p role="status" className="bad-text">מומלץ לייצא חבילת גיבוי.</p>}
      <div className="row">
        <button className="btn" disabled={busy} onClick={doExport}>ייצוא חבילה מוצפנת</button>
        <label className="btn">שחזור מחבילה<input type="file" accept=".json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
      </div>
      {pkg && <div role="status"><p>{pkg.name}: ייווצרו {pkg.check.restored} זהויות, {pkg.check.same} כבר קיימות
        {pkg.check.no_student ? `, ${pkg.check.no_student} לתלמידים שאינם קיימים (ידולגו)` : ''}{pkg.check.erased ? `, ${pkg.check.erased} נמחקו במכוון (ידולגו)` : ''}
        {pkg.check.conflict ? `, ${pkg.check.conflict} שונות מהקיימות (לא יידרסו)` : ''}.</p>
        <button className="btn primary" disabled={busy || !pkg.check.restored} onClick={restore}>שחזר</button></div>}
      {msg && <p role="status">{msg}</p>}
    </section>
  );
}
