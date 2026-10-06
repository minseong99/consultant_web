// 배포 금지 시간에는 운영(production) 배포를 건너뛴다. 사이트는 그대로 열려 있고 새 버전만 올라가지 않는다.
// Vercel이 빌드 전에 실행한다 (vercel.json 의 ignoreCommand). 종료 코드 0 = 빌드 건너뜀, 1 = 빌드 진행.
//
// 금지 시간은 한국 시간 기준이며 쉼표로 여러 개를 적는다.
//   09:00-18:00               매일 그 시간 (22:00-02:00 처럼 자정을 넘겨도 된다)
//   월-금 09:00-18:00          그 요일의 그 시간
//   2026-10-15                그날 하루
//   2026-10-15 13:00-17:00    그날 그 시간
// Vercel 환경변수 DEPLOY_FREEZE 가 있으면 아래 기본값 대신 그것을 쓴다. off 로 두면 금지 시간이 없다.
// 건너뛴 버전은 자동으로 다시 배포되지 않는다. 금지 시간이 끝난 뒤 Vercel에서 Redeploy 하거나 다음 병합 때 함께 올라간다.
import { pathToFileURL } from "node:url";

export const DEFAULT_FREEZE = "";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const minutes = (text) => {
  const [h, m] = text.split(":").map(Number);
  return h * 60 + m;
};

// 한국 시간의 날짜, 요일, 자정부터의 분
export function kstParts(date) {
  const kst = new Date(date.getTime() + 9 * 3600_000);
  return { day: kst.toISOString().slice(0, 10), weekday: kst.getUTCDay(), minute: kst.getUTCHours() * 60 + kst.getUTCMinutes() };
}

export function parseFreeze(spec) {
  const text = (spec ?? "").trim();
  if (!text || text.toLowerCase() === "off") return [];
  return text.split(",").map((raw) => {
    const entry = raw.trim();
    const match = entry.match(/^(?:(\d{4}-\d{2}-\d{2})|([일월화수목금토])(?:-([일월화수목금토]))?)?\s*(?:(\d{1,2}:\d{2})-(\d{1,2}:\d{2}))?$/);
    if (!match || (!match[1] && !match[2] && !match[4])) throw new Error(`금지 시간 형식을 읽을 수 없습니다: "${entry}"`);
    const [, day, from, to, start, end] = match;
    return {
      entry,
      day,
      weekdays: from ? [DAYS.indexOf(from), DAYS.indexOf(to ?? from)] : null,
      start: start ? minutes(start) : 0,
      end: end ? minutes(end) : 24 * 60,
    };
  });
}

// 지금 걸리는 금지 시간 항목을 돌려준다. 없으면 null.
export function frozenBy(rules, date) {
  const now = kstParts(date);
  const yesterday = kstParts(new Date(date.getTime() - 24 * 3600_000));
  const dayMatches = (rule, at) => {
    if (rule.day) return rule.day === at.day;
    if (!rule.weekdays) return true;
    const [from, to] = rule.weekdays;
    return from <= to ? at.weekday >= from && at.weekday <= to : at.weekday >= from || at.weekday <= to;
  };
  for (const rule of rules) {
    if (rule.start < rule.end) {
      if (dayMatches(rule, now) && now.minute >= rule.start && now.minute < rule.end) return rule.entry;
    } else {
      // 자정을 넘기는 시간대: 시작한 날의 밤, 또는 그 다음 날의 새벽
      if (dayMatches(rule, now) && now.minute >= rule.start) return rule.entry;
      if (dayMatches(rule, yesterday) && now.minute < rule.end) return rule.entry;
    }
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 미리보기(PR) 배포는 막지 않는다. Vercel 밖에서 실행하면 운영 배포로 보고 판정만 출력한다.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    console.log("미리보기 배포입니다. 진행합니다.");
    process.exit(1);
  }
  let hit;
  try {
    hit = frozenBy(parseFreeze(process.env.DEPLOY_FREEZE ?? DEFAULT_FREEZE), new Date());
  } catch (error) {
    // 설정을 잘못 적어 배포가 영영 막히는 일이 없게, 읽지 못하면 진행한다.
    console.log(`${error.message} 금지 시간 없이 진행합니다.`);
    process.exit(1);
  }
  if (hit) {
    console.log(`배포 금지 시간입니다 (${hit}, 한국 시간). 이번 배포를 건너뜁니다.`);
    process.exit(0);
  }
  console.log("배포 금지 시간이 아닙니다. 진행합니다.");
  process.exit(1);
}
