// שמירת "איפה הייתי" (מסך, קבוצה, לשונית, שיחה, טיוטת צ׳אט) כדי לשחזר אחרי רענון או סגירה ופתיחה מחדש.
// נשמר ב-sessionStorage: רענון מחזיר לאותו מסך, אבל פתיחה חדשה של האפליקציה (חלון/לשונית חדשים) תמיד מתחילה בדף הבית. לא מכיל נתוני תלמידים.
const KEY = 'teacher-app:view';
const TTL = 12 * 3600000;
export interface ViewState { page?: string; groupId?: string | null; tab?: string; tabGroup?: string; convId?: string | null; chatText?: string; t?: number }
let cache: ViewState | null | undefined;
export function loadView(): ViewState {
  if (cache === undefined) {
    try { const j = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as ViewState | null; cache = j && j.t && Date.now() - j.t < TTL ? j : null; } catch { cache = null; }
  }
  return cache ?? {};
}
/** הערך שנקרא בטעינת האפליקציה (לפני שהמצב משתנה); לשחזור חד-פעמי */
export const boot: ViewState = loadView();
export function saveView(patch: Partial<ViewState>) {
  try { const next = { ...(cache ?? {}), ...patch, t: Date.now() }; cache = next; sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
}
