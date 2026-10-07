import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { MESSAGE_MAX_LENGTH } from "@/lib/message";

export const maxDuration = 100;

// 직원이 확인·수정한 문자를 보낸다. 발송 직전의 동의 확인과 중복 발송 차단은 n8n이 한다.
export function POST(request: Request) {
  return withStaff(async () => {
    const body = await readJson(request);
    const scheduleId = text(body.schedule_id);
    const message = text(body.message_text);
    if (!scheduleId) return fail(400, "MISSING_FIELDS", "schedule_id가 필요합니다.");
    if (!message) return fail(400, "MISSING_FIELDS", "보낼 문자 내용을 입력해 주세요.");
    if (message.length > MESSAGE_MAX_LENGTH) return fail(400, "TOO_LONG", `문자가 너무 깁니다. ${MESSAGE_MAX_LENGTH.toLocaleString("ko-KR")}자 이내로 줄여 주세요.`);
    return Response.json(await getBackend().sendMessage(scheduleId, message));
  });
}
