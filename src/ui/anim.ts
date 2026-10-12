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

/** מחוון מחליק לכל המתגים (.seg, .mini-seg) ולשוניות (.tabs): מוסיף אלמנט אחד ומזיז אותו אל הפריט הפעיל.
 *  עובד גלובלית דרך MutationObserver, כך שכל מתג קיים וחדש נהנה מזה בלי שינוי ברכיבים. */
export function initSliders(): () => void {
  const ACTIVE = '[aria-pressed="true"], [aria-selected="true"]';
  const place = (box: HTMLElement) => {
    let ind = box.querySelector<HTMLElement>(':scope > .ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'ind'; ind.setAttribute('aria-hidden', 'true'); box.prepend(ind); box.classList.add('has-ind'); }
    const el = box.querySelector<HTMLElement>(`:scope > ${ACTIVE.split(', ').map((s) => `button${s}`).join(', :scope > ')}`);
    if (!el || !el.offsetWidth) { ind.style.opacity = '0'; return; }
    const isTabs = box.classList.contains('tabs');
    ind.style.opacity = '1';
    ind.style.width = `${el.offsetWidth}px`;
    ind.style.height = isTabs ? '3px' : `${el.offsetHeight}px`;
    ind.style.transform = `translate(${el.offsetLeft}px, ${isTabs ? el.offsetTop + el.offsetHeight - 2 : el.offsetTop}px)`;
    if (!box.classList.contains('ind-ready')) requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('ind-ready'))); // בלי תנועה במיקום הראשון
  };
  let queued = false;
  const scan = () => { queued = false; document.querySelectorAll<HTMLElement>('.seg, .mini-seg, .tabs').forEach(place); };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  const mo = new MutationObserver(queue);
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class'] });
  window.addEventListener('resize', queue);
  void document.fonts?.ready.then(queue);
  queue();
  return () => { mo.disconnect(); window.removeEventListener('resize', queue); };
}
