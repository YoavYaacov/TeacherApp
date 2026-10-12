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
      const el = box.querySelector<HTMLElement>('[aria-current="page"]:not(.nav-ai)');
      const st = box.style;
      if (!el || hidden) { box.classList.add('slider-off'); return; }
      box.classList.remove('slider-off');
      st.setProperty('--ix', `${el.offsetLeft}px`); st.setProperty('--iy', `${el.offsetTop}px`); st.setProperty('--iw', `${el.offsetWidth}px`); st.setProperty('--ih', `${el.offsetHeight}px`);
    };
    place();
    if (first.current) { first.current = false; requestAnimationFrame(() => box.classList.add('slider-ready')); } // בלי תנועה בטעינה הראשונה
    const ro = new ResizeObserver(place); ro.observe(box);
    return () => ro.disconnect();
  }, [ref, activeKey, hidden]);
}
