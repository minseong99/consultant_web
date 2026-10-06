import { fail, readJson, text } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { checkPassword, setSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = await readJson(request);
  const staffId = text(body.staff_id);
  if (!checkPassword(typeof body.password === "string" ? body.password : "")) {
    return fail(401, "INVALID_PASSWORD", "비밀번호가 올바르지 않습니다.");
  }
  try {
    const staff = (await getBackend().listStaff()).find((s) => s.staff_id === staffId);
    if (!staff) return fail(400, "STAFF_NOT_FOUND", "직원을 선택해 주세요.");
    await setSession({ staff_id: staff.staff_id, store_id: staff.store_id });
    return Response.json({ success: true });
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", error instanceof Error ? error.message : "로그인에 실패했습니다.");
  }
}
