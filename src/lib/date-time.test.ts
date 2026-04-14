import { describe, expect, it } from 'vitest';

import { formatDateTimeSafe, parseDateTimeValue } from '@/lib/date-time';

describe('date-time helpers', () => {
  it('parses unix timestamps and compact datetime strings', () => {
    expect(parseDateTimeValue('1712800000')?.toISOString()).toBe('2024-04-11T01:46:40.000Z');
    expect(parseDateTimeValue('20260409145704')?.toISOString()).toBe('2026-04-09T14:57:04.000Z');
  });

  it('returns fallback text for invalid values instead of throwing', () => {
    expect(formatDateTimeSafe('')).toBe('时间未知');
    expect(formatDateTimeSafe('not-a-date')).toBe('时间未知');
    expect(formatDateTimeSafe(null)).toBe('时间未知');
  });
});
