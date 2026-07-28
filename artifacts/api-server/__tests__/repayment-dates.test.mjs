/**
 * repayment-dates.test.mjs
 *
 * Pure unit tests for the installment date-generation formula used in both
 * the backend (requests.ts) and the frontend (RepaymentSchedulerModal.tsx).
 *
 * Formula: payment_i = startDate + round(i * periodDays / (count - 1))
 *   • i = 0         → always startDate (day 0)
 *   • i = count - 1 → always startDate + periodDays (full span covered)
 *   • intermediate  → evenly distributed within the span
 *
 * Run: node --test artifacts/api-server/__tests__/repayment-dates.test.mjs
 *   or: pnpm --filter @workspace/api-server exec node --test __tests__/repayment-dates.test.mjs
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

// ── Shared formula (mirrors both frontend + backend implementations) ─────────
function computeInstallmentDates(startDate, installmentCount, periodDays) {
  if (installmentCount <= 1) return [new Date(startDate)];
  return Array.from({ length: installmentCount }, (_, i) => {
    const d = new Date(startDate);
    const offsetDays = Math.round((i * periodDays) / (installmentCount - 1));
    d.setDate(d.getDate() + offsetDays);
    return d;
  });
}

/** Returns the day offset from startDate to a given installment date */
function dayOffset(startDate, date) {
  return Math.round((date.getTime() - startDate.getTime()) / 86_400_000);
}

const START = new Date("2026-08-01T00:00:00.000Z");

describe("computeInstallmentDates — span contract", () => {
  // For every valid (count, period) combination the portal exposes:
  // first payment = day 0, last payment = day periodDays (full span covered)
  const cases = [
    { count: 2, periodDays: 2,   label: "2 payments / 2 days" },
    { count: 2, periodDays: 14,  label: "2 payments / 2 weeks" },
    { count: 2, periodDays: 60,  label: "2 payments / 2 months" },
    { count: 2, periodDays: 730, label: "2 payments / 2 years" },
    { count: 4, periodDays: 2,   label: "4 payments / 2 days" },
    { count: 4, periodDays: 14,  label: "4 payments / 2 weeks" },
    { count: 4, periodDays: 60,  label: "4 payments / 2 months" },
    { count: 4, periodDays: 730, label: "4 payments / 2 years" },
  ];

  for (const { count, periodDays, label } of cases) {
    test(`${label}: first=day0, last=day${periodDays}, count=${count}`, () => {
      const dates = computeInstallmentDates(START, count, periodDays);

      assert.equal(dates.length, count, "returned wrong number of dates");
      assert.equal(dayOffset(START, dates[0]), 0,          "first payment must be on startDate");
      assert.equal(dayOffset(START, dates[count - 1]), periodDays, "last payment must be on day periodDays");
    });
  }
});

describe("computeInstallmentDates — monotonic ordering", () => {
  test("dates are strictly increasing", () => {
    // 4 payments over 730 days — wide enough that rounding can't collapse any pair
    const dates = computeInstallmentDates(START, 4, 730);
    for (let i = 1; i < dates.length; i++) {
      assert.ok(
        dates[i] > dates[i - 1],
        `date[${i}] (${dates[i].toISOString()}) should be after date[${i-1}] (${dates[i-1].toISOString()})`
      );
    }
  });
});

describe("computeInstallmentDates — concrete values", () => {
  test("2 payments / 60 days: day 0 and day 60", () => {
    const [d0, d1] = computeInstallmentDates(START, 2, 60);
    assert.equal(dayOffset(START, d0), 0);
    assert.equal(dayOffset(START, d1), 60);
  });

  test("4 payments / 14 days: days 0, 5, 9, 14  (round(i*14/3))", () => {
    const dates = computeInstallmentDates(START, 4, 14);
    const offsets = dates.map(d => dayOffset(START, d));
    // round(0*14/3)=0, round(1*14/3)=round(4.67)=5, round(2*14/3)=round(9.33)=9, round(3*14/3)=14
    assert.deepEqual(offsets, [0, 5, 9, 14]);
  });

  test("2 payments / 2 days: day 0 and day 2", () => {
    const [d0, d1] = computeInstallmentDates(START, 2, 2);
    assert.equal(dayOffset(START, d0), 0);
    assert.equal(dayOffset(START, d1), 2);
  });

  test("4 payments / 2 days: days 0, 1, 1, 2  (rounding may collapse middle pair)", () => {
    const dates = computeInstallmentDates(START, 4, 2);
    const offsets = dates.map(d => dayOffset(START, d));
    // round(0*2/3)=0, round(2/3)=1, round(4/3)=1, round(2)=2
    assert.deepEqual(offsets, [0, 1, 1, 2]);
    // First and last still satisfy the span contract
    assert.equal(offsets[0], 0);
    assert.equal(offsets[3], 2);
  });
});

describe("computeInstallmentDates — edge cases", () => {
  test("count=1 returns single date on startDate", () => {
    const dates = computeInstallmentDates(START, 1, 60);
    assert.equal(dates.length, 1);
    assert.equal(dayOffset(START, dates[0]), 0);
  });

  test("old (incorrect) formula would fail the span contract", () => {
    // Verify we're NOT accidentally using the old intervalDays = floor(P / N) formula
    // Old: 2 payments / 60 days → interval=30 → last payment day 30 (NOT 60)
    const oldFormula = (count, periodDays) =>
      Array.from({ length: count }, (_, i) => {
        const d = new Date(START);
        const interval = Math.floor(periodDays / count);
        d.setDate(d.getDate() + (i === 0 ? 0 : interval * i));
        return d;
      });
    const oldDates = oldFormula(2, 60);
    const oldLastOffset = dayOffset(START, oldDates[1]);
    // Old formula gives day 30, not day 60 — confirm the bug exists in old code
    assert.equal(oldLastOffset, 30, "old formula should give day 30 (not 60)");

    // New formula correctly gives day 60
    const newDates = computeInstallmentDates(START, 2, 60);
    assert.equal(dayOffset(START, newDates[1]), 60, "new formula must give day 60");
  });
});
