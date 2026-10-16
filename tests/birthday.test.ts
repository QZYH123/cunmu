import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCount, fmtDays } from '../src/lib/birthday';

const at = (tz: string, iso: string) => { process.env.TZ = tz; return new Date(iso); };

test('birthday: the birthday is day 1; the count runs on local calendar days', () => {
  process.env.TZ = 'Asia/Singapore';
  assert.equal(dayCount('1995-06-03', new Date(1995, 5, 3, 12))!.n, 1);
  assert.equal(dayCount('1995-06-03', new Date(1995, 5, 4, 0, 1))!.n, 2);
  assert.equal(dayCount('1995-06-03', new Date(2026, 9, 11, 9))!.n, 11454);
  assert.equal(fmtDays(11454), '11,454');
  assert.equal(dayCount('2030-01-01', new Date(2026, 9, 11)), null, 'a birthday still ahead says nothing');
  assert.equal(dayCount('', new Date()), null);
  assert.equal(dayCount('1995-02-30', new Date()), null, 'not a day');
  assert.equal(dayCount('19950603', new Date()), null);
});

test('birthday: the day turns at local midnight, not at UTC midnight', () => {
  // 2026-10-10 16:30 UTC is already 11 October in Singapore, still 10 October in Los Angeles
  assert.equal(dayCount('1995-06-03', at('Asia/Singapore', '2026-10-10T16:30:00Z'))!.n, 11454);
  assert.equal(dayCount('1995-06-03', at('America/Los_Angeles', '2026-10-10T16:30:00Z'))!.n, 11453);
  // across a daylight-saving change the count still moves by one a day
  const a = dayCount('2000-01-01', at('America/New_York', '2026-03-08T04:00:00Z'))!.n; // 7 March, 23:00
  const b = dayCount('2000-01-01', at('America/New_York', '2026-03-09T04:00:00Z'))!.n; // 9 March, 00:00 (after the change)
  assert.equal(b - a, 2);
  process.env.TZ = 'Asia/Singapore';
});

test('birthday: leap years count their 29 February', () => {
  process.env.TZ = 'UTC';
  // 2024-01-01 → 2025-01-01 is 366 days in a leap year
  assert.equal(dayCount('2024-01-01', new Date(2025, 0, 1))!.n, 367);
  assert.equal(dayCount('2023-01-01', new Date(2024, 0, 1))!.n, 366);
  assert.equal(dayCount('2000-02-29', new Date(2000, 1, 29))!.n, 1);
  assert.equal(dayCount('2001-02-29', new Date()), null, '2001 has no 29 February');
});

test('birthday: the day itself; 29 February is kept on 28 February in a common year', () => {
  process.env.TZ = 'Asia/Singapore';
  assert.equal(dayCount('1995-06-03', new Date(2026, 5, 3))!.birthday, true);
  assert.equal(dayCount('1995-06-03', new Date(2026, 5, 4))!.birthday, false);
  assert.equal(dayCount('1995-06-03', new Date(1995, 5, 3))!.birthday, false, 'the day you were born is not a birthday yet');
  assert.equal(dayCount('2000-02-29', new Date(2027, 1, 28))!.birthday, true);
  assert.equal(dayCount('2000-02-29', new Date(2027, 2, 1))!.birthday, false);
  assert.equal(dayCount('2000-02-29', new Date(2028, 1, 28))!.birthday, false, 'a leap year has its own 29th');
  assert.equal(dayCount('2000-02-29', new Date(2028, 1, 29))!.birthday, true);
});

test('birthday: round days are every thousandth', () => {
  process.env.TZ = 'Asia/Singapore';
  // 1995-06-03 + 9,999 days = 2022-10-18 (day 10,000)
  const d = dayCount('1995-06-03', new Date(2022, 9, 18))!;
  assert.equal(d.n, 10000); assert.equal(d.round, true);
  assert.equal(dayCount('1995-06-03', new Date(2022, 9, 19))!.round, false);
  assert.equal(dayCount('1995-06-03', new Date(1998, 1, 26))!.n, 1000);
  assert.equal(dayCount('1995-06-03', new Date(1998, 1, 26))!.round, true);
  assert.equal(dayCount('1995-06-03', new Date(1998, 1, 27))!.round, false);
});
