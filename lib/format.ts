const TZ = "Asia/Colombo";

export function fmtDate(d: Date | number | string, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(d));
}

export function fmtDateTime(d: Date | number | string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}

export function fmtTime(d: Date | number | string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
}

export function fmtDay(key: string): string {
  // key is YYYY-MM-DD (Colombo). Use noon UTC to avoid edge shifts.
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" }).format(new Date(`${key}T12:00:00Z`));
}

export function lkr(n: number): string {
  return `LKR ${Math.round(n).toLocaleString("en-US")}`;
}

export function hrs(minutesOrHours: number, unit: "min" | "h" = "h", digits = 1): string {
  const h = unit === "min" ? minutesOrHours / 60 : minutesOrHours;
  return `${h.toFixed(digits)} h`;
}
