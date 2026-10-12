import { describe as d2, expect as e2, it as i2 } from 'vitest';
import { gradeTone } from './gradebook';
d2('gradeTone', () => {
  i2('thresholds', () => {
    e2(gradeTone(55.99)).toBe('fail'); e2(gradeTone(56)).toBe(''); e2(gradeTone(89.9)).toBe(''); e2(gradeTone(90)).toBe('star'); e2(gradeTone(0)).toBe('fail'); e2(gradeTone(null)).toBe('');
  });
});
