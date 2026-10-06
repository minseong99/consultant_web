import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

export function POST(request: Request) {
  return withStaff(async () => {
    const scheduleId = text((await readJson(request)).schedule_id);
    if (!scheduleId) return fail(400, "MISSING_FIELDS", "schedule_id가 필요합니다.");
    return Response.json(await getBackend().sendNow(scheduleId));
  });
}
