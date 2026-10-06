import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

export function POST(request: Request) {
  return withStaff(async () => {
    const customerId = text((await readJson(request)).customer_id);
    if (!customerId) return fail(400, "MISSING_FIELDS", "customer_id가 필요합니다.");
    return Response.json(await getBackend().recommend(customerId));
  });
}
