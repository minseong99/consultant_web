const KST = "Asia/Seoul";

function valid(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 10/12 (월) 10:00 */
export function formatDateTime(value: string | null | undefined) {
  const date = valid(value);
  if (!date) return "-";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} (${get("weekday")}) ${get("hour")}:${get("minute")}`;
}

/** 2026. 10. 12. — date 컬럼(YYYY-MM-DD)은 시간대 변환 없이 그대로 읽는다 */
export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.`;
}

export function formatTime(value: string | null | undefined) {
  const date = valid(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatPhone(value: string | null | undefined) {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value;
}

export function formatWon(value: number | null | undefined) {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

/** KST 기준 오늘 날짜 YYYY-MM-DD */
export function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: KST }).format(now);
}

export function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
