import { fail } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { config, missingRealModeEnv, USE_MOCK } from "@/lib/config";
import { passwordRequired } from "@/lib/session";

// 로그인 화면용: 선택할 수 있는 직원 목록
export async function GET() {
  if (!USE_MOCK) {
    const missing = missingRealModeEnv();
    if (missing.length) return fail(500, "CONFIG_MISSING", `환경변수가 설정되지 않았습니다: ${missing.join(", ")}`);
  }
  try {
    const all = await getBackend().listStaff();
    // 기본 직원이 지정되어 있으면 목록 맨 앞에 둔다(로그인 화면은 첫 항목을 선택해 둔다).
    const staff = [...all].sort(
      (a, b) => Number(b.staff_id === config.staffDefaultId) - Number(a.staff_id === config.staffDefaultId),
    );
    return Response.json({ success: true, staff, password_required: passwordRequired(), mock: USE_MOCK });
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", error instanceof Error ? error.message : "직원 목록을 불러오지 못했습니다.");
  }
}
