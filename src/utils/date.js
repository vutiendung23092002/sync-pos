const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateString(dateString) {
  const match = DATE_PATTERN.exec(dateString || "");
  if (!match) {
    throw new Error(`Invalid date "${dateString}". Expected YYYY-MM-DD`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${dateString}"`);
  }

  return { year, month, day };
}

export function getVietnamDayUnixRange(dateString) {
  const { year, month, day } = parseDateString(dateString);
  const fromMs = Date.UTC(year, month - 1, day, 0, 0, 0) - VIETNAM_OFFSET_MS;
  const toMs = Date.UTC(year, month - 1, day, 23, 59, 59) - VIETNAM_OFFSET_MS;

  return {
    fromTs: Math.floor(fromMs / 1000),
    toTs: Math.floor(toMs / 1000),
    fromMs,
    toMs,
  };
}

export function formatUtcDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getVietnamToday(now = new Date()) {
  return formatUtcDate(new Date(now.getTime() + VIETNAM_OFFSET_MS));
}

export function addDays(dateString, amount) {
  const { year, month, day } = parseDateString(dateString);
  return formatUtcDate(new Date(Date.UTC(year, month - 1, day) + amount * DAY_MS));
}

export function enumerateDates(from, to) {
  const fromParts = parseDateString(from);
  const toParts = parseDateString(to);
  const start = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);
  const end = Date.UTC(toParts.year, toParts.month - 1, toParts.day);

  if (start > end) {
    throw new Error(`FROM (${from}) must not be after TO (${to})`);
  }

  const dates = [];
  for (let cursor = start; cursor <= end; cursor += DAY_MS) {
    dates.push(formatUtcDate(new Date(cursor)));
  }
  return dates;
}

export function resolveDateRange({ from, to, lookbackDays = 14, now = new Date() }) {
  if (Boolean(from) !== Boolean(to)) {
    throw new Error("FROM and TO must be provided together");
  }

  if (from && to) {
    return { from, to, dates: enumerateDates(from, to) };
  }

  const today = getVietnamToday(now);
  const resolvedFrom = addDays(today, -lookbackDays);
  return {
    from: resolvedFrom,
    to: today,
    dates: enumerateDates(resolvedFrom, today),
  };
}

export function resolveSyncDateRange({
  from,
  to,
  lookbackDays = 14,
  mode = "backfill",
  now = new Date(),
}) {
  const today = getVietnamToday(now);
  if (mode === "today") {
    return { from: today, to: today, dates: [today] };
  }
  if (mode !== "backfill") {
    throw new Error("SYNC_MODE must be backfill or today");
  }

  const yesterday = addDays(today, -1);
  const requested = resolveDateRange({ from, to, lookbackDays, now });
  const clampedTo = requested.to > yesterday ? yesterday : requested.to;
  if (requested.from > clampedTo) {
    throw new Error(
      `Backfill FROM (${requested.from}) must not be after yesterday (${yesterday})`,
    );
  }
  return {
    from: requested.from,
    to: clampedTo,
    dates: enumerateDates(requested.from, clampedTo),
  };
}

export function getMonthYear(dateString) {
  const { month, year } = parseDateString(dateString);
  return { month, year };
}
