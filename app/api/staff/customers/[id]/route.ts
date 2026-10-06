import { fail, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export function GET(_request: Request, context: RouteContext<"/api/staff/customers/[id]">) {
  return withStaff(async () => {
    const { id } = await context.params;
    const detail = await getBackend().customerDetail(id);
    if (!detail) return fail(404, "CUSTOMER_NOT_FOUND", "고객 정보를 찾을 수 없습니다.");
    return Response.json({ success: true, ...detail });
  });
}
