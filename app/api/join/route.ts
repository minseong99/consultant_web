import { fail, dateOrNull, numberOrNull, readJson, text, textOrNull } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { isValidPhone } from "@/lib/fields";
import type { IntakeInput } from "@/lib/types";

export const maxDuration = 60;

// 고객 화면에서 호출하는 유일한 API. 로그인 없이 접근하므로 입력을 서버에서 다시 검증한다.
export async function POST(request: Request) {
  const body = await readJson(request);
  const input: IntakeInput = {
    customer_name: text(body.customer_name),
    phone: text(body.phone).replace(/\D/g, ""),
    current_device: text(body.current_device),
    current_plan: text(body.current_plan),
    usage_pattern: text(body.usage_pattern),
    consultation_goal: text(body.consultation_goal),
    age: numberOrNull(body.age),
    contract_end_date: dateOrNull(body.contract_end_date),
    device_use_months: numberOrNull(body.device_use_months),
    target_monthly_budget: numberOrNull(body.target_monthly_budget),
    interests: textOrNull(body.interests),
    privacy_consent: body.privacy_consent === true,
    marketing_consent: body.marketing_consent === true,
    recontact_consent: body.recontact_consent === true,
  };

  if (!input.privacy_consent) return fail(400, "CONSENT_REQUIRED", "개인정보 수집·이용 동의가 필요합니다.");
  const required = ["customer_name", "current_device", "current_plan", "usage_pattern", "consultation_goal"] as const;
  if (required.some((key) => !input[key])) return fail(400, "MISSING_FIELDS", "필수 항목을 모두 입력해 주세요.");
  if (!isValidPhone(input.phone)) return fail(400, "INVALID_PHONE", "휴대폰 번호 형식을 확인해 주세요.");

  try {
    const result = await getBackend().intake(input);
    return Response.json(result, { status: result.success ? 200 : 502 });
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", "접수 중 오류가 발생했습니다. 직원에게 문의해 주세요.");
  }
}
