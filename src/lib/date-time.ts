const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Shanghai',
});

function isValidDate(date: Date) {
  return Number.isFinite(date.getTime());
}

function parseNumericTimestamp(value: number) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const absoluteValue = Math.abs(value);
  let normalizedValue = value;

  if (absoluteValue >= 1_000_000_000_000_000) {
    normalizedValue = value / 1000;
  } else if (absoluteValue < 100_000_000_000) {
    normalizedValue = value * 1000;
  }

  const parsedDate = new Date(normalizedValue);

  return isValidDate(parsedDate) ? parsedDate : null;
}

function parseCompactDateTime(value: string) {
  const matched = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);

  if (!matched) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = matched;
  const parsedDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  return isValidDate(parsedDate) ? parsedDate : null;
}

export function parseDateTimeValue(value: unknown) {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === 'number') {
    return parseNumericTimestamp(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const compactDateTime = parseCompactDateTime(trimmedValue);

  if (compactDateTime) {
    return compactDateTime;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmedValue)) {
    return parseNumericTimestamp(Number(trimmedValue));
  }

  const parsedDate = new Date(trimmedValue);

  return isValidDate(parsedDate) ? parsedDate : null;
}

export function formatDateTimeSafe(value: unknown, fallback = '时间未知') {
  const parsedDate = parseDateTimeValue(value);

  return parsedDate ? DATE_TIME_FORMATTER.format(parsedDate) : fallback;
}
