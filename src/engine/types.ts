// טיפוסי מנוע החישוב. המנוע טהור (ללא I/O) כדי שיהיה ניתן לבדיקה.

export type GradeCell =
  | { kind: 'empty' }
  | { kind: 'score'; value: number } // 0..100, כולל 0 אמיתי
  | { kind: 'exempt' } // פטור
  | { kind: 'absent' }; // לא נבחן

export type MakeupPolicy = 'best' | 'latest' | 'average';

/** ציוני תלמיד באירוע: ניסיון א' ואופציונלית מועד ב'. */
export interface EventGrades {
  a: GradeCell;
  b?: GradeCell;
  /** override ברמת תלמיד; undefined = לפי מדיניות המבחן */
  policyOverride?: MakeupPolicy;
}

export interface AssessmentEvent {
  id: string;
  /** משקל באחוזים בתוך הקטגוריה; מתעלמים ממנו כאשר weightMode='equal' */
  weight: number | null;
  date: string; // ISO, לצורך tie-break
  makeupPolicy: MakeupPolicy;
  cancelled?: boolean;
}

export interface Category {
  id: string;
  name: string;
  weight: number; // אחוזים
  weightMode: 'equal' | 'custom'; // משקלי אירועים בתוך הקטגוריה
  dropLowest: boolean; // ברירת מחדל false
  events: AssessmentEvent[];
}

export interface TermConfig {
  categories: Category[];
}

export interface RoundingPolicy {
  calcDecimals: number; // ציון מחושב (ברירת מחדל 2)
  finalDecimals: number; // ציון סופי (ברירת מחדל 0)
}
export const DEFAULT_ROUNDING: RoundingPolicy = { calcDecimals: 2, finalDecimals: 0 };

export interface ConfigIssue {
  code:
    | 'CATEGORY_WEIGHTS_SUM'
    | 'EVENT_WEIGHTS_SUM'
    | 'EVENT_WEIGHT_MISSING'
    | 'NEGATIVE_WEIGHT'
    | 'ANNUAL_WEIGHTS_SUM';
  categoryId?: string;
  message: string;
}

export interface CategoryResult {
  categoryId: string;
  average: number | null; // null = אין ציונים תקפים
  droppedEventId: string | null;
  /** אירועים פעילים ללא ציון תקף (ריק/פטור/לא נבחן) */
  missingEventIds: string[];
  /** ציון מקורי של כל אירוע תקף אחרי פתרון מועד ב' */
  effective: Record<string, number>;
}

export interface TermResult {
  /** ממוצע ביניים לא מעוגל; null אם אין שום נתון */
  calculated: number | null;
  calculatedRounded: number | null;
  /** true אם החישוב חלקי (חסרים ציונים או קטגוריות ללא נתונים) */
  partial: boolean;
  categories: CategoryResult[];
  emptyCategoryIds: string[];
}

export type FinalSource = 'approved' | 'override';

/** ציון סופי שמור: snapshot של החישוב בזמן האישור כדי לזהות התיישנות. */
export interface FinalGrade {
  value: number;
  source: FinalSource;
  basisCalculated: number | null;
}

export interface FinalStatus {
  value: number | null;
  source: FinalSource | null;
  /** המקור (ציון מחושב) השתנה מאז האישור/override */
  stale: boolean;
}

export interface AnnualResult {
  calculated: number | null;
  calculatedRounded: number | null;
  /** מחציות שחסר להן ציון סופי */
  missingTerms: (1 | 2)[];
}
