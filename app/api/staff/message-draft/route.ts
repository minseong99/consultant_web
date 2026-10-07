import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

// [지금 발송]을 눌렀을 때의 문자 초안. 발송하지 않고 일정 상태도 바꾸지 않는다.
export function POST(request: Request) {
  return withStaff(async () => {
    const scheduleId = text((await readJson(request)).schedule_id);
    if (!scheduleId) return fail(400, "MISSING_FIELDS", "schedule_id가 필요합니다.");
    return Response.json(await getBackend().draftMessage(scheduleId));
  });
}
