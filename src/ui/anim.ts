// מצב הנפשות: 'full' | 'minimal' | 'off'. נשמר ב-user_settings.prefs.anim (מסונכרן) וגם במכשיר (כדי שיחול כבר בטעינה).
// המכשיר שמבקש "הפחתת תנועה" גובר: ההנפשות כבויות.
import { useLayoutEffect, useRef, type RefObject } from 'react';
export type AnimMode = 'full' | 'minimal' | 'off';
const KEY = 'teacher-app:anim';
export const systemReducesMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const localAnim = (): AnimMode => { try { const v = localStorage.getItem(KEY); return v === 'minimal' || v === 'off' ? v : 'full'; } catch { return 'full'; } };
export function applyAnim(mode: AnimMode) {
  document.documentElement.dataset.anim = systemReducesMotion() ? 'off' : mode;
  try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
}

/** "רקע מחליק" בין פריטי ניווט: מודד את הפריט המסומן ומזיז אליו אלמנט אחד (transform בלבד). */
export function useNavSlider(ref: RefObject<HTMLElement | null>, activeKey: string, hidden = false) {
  const first = useRef(true);
  useLayoutEffect(() => {
    const box = ref.current; if (!box) return;
    const place = () => {
      const el = box.querySelector<HTMLElement>('[aria-current="page"]');
      const st = box.style;
      if (!el || hidden) { box.classList.add('slider-off'); return; }
      box.classList.remove('slider-off');
      let x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      if (el.classList.contains('nav-ai')) {
        // כפתור העוזר בנייד: העיגול בולט מעל הסרגל, ולכן המחוון נשאר רק מתחת לעיגול (סביב התווית)
        const ic = el.querySelector('svg'); if (ic) { const gap = el.getBoundingClientRect().bottom - ic.getBoundingClientRect().bottom; y = y + h - gap - 2; h = gap + 2; }
      }
      st.setProperty('--ix', `${x}px`); st.setProperty('--iy', `${y}px`); st.setProperty('--iw', `${w}px`); st.setProperty('--ih', `${h}px`);
    };
    place();
    if (first.current) { first.current = false; requestAnimationFrame(() => box.classList.add('slider-ready')); } // בלי תנועה בטעינה הראשונה
    const ro = new ResizeObserver(place); ro.observe(box);
    return () => ro.disconnect();
  }, [ref, activeKey, hidden]);
}
