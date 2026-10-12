import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { writeFileSync } from 'node:fs';
import { buildXlsx } from './xlsx';

describe('xlsx', () => {
  it('builds a valid zip with escaped hebrew content', () => {
    const b = buildXlsx([{ name: 'מחצית א׳', rows: [['תלמיד', 'ציון'], ['כהן <דנה> & "x"', 85.5], ['לוי', null]] }, { name: 'a/b?', rows: [['x']] }]);
    const z = unzipSync(b);
    expect(Object.keys(z)).toContain('xl/worksheets/sheet2.xml');
    const s1 = strFromU8(z['xl/worksheets/sheet1.xml']);
    expect(s1).toContain('rightToLeft="1"');
    expect(s1).toContain('כהן &lt;דנה&gt; &amp; &quot;x&quot;');
    expect(s1).toContain('<v>85.5</v>');
    expect(strFromU8(z['xl/workbook.xml'])).toContain('name="a b"');
    if (process.env.XLSX_OUT) writeFileSync(process.env.XLSX_OUT, b);
  });
});
