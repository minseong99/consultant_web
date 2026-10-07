import "server-only";

// 고객 상담 화면의 본인 확인 시도 제한. 같은 주소에서 10분 동안 5번 틀리면 잠시 막는다.
// 서버 메모리에 두므로 서버리스 배포에서는 인스턴스마다 따로 센다(완전한 차단이 아니라 연속 시도를 늦추는 용도).
const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

export function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function recent(key: string) {
  const since = Date.now() - WINDOW_MS;
  const list = (failures.get(key) ?? []).filter((at) => at > since);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

export function isBlocked(key: string) {
  return recent(key).length >= MAX_FAILURES;
}

export function recordFailure(key: string) {
  failures.set(key, [...recent(key), Date.now()]);
}
