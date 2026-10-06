import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

export function GET() {
  return withStaff(async (session) =>
    Response.json({ success: true, promotions: await getBackend().listPromotions(session.store_id) }),
  );
}

export function POST(request: Request) {
  return withStaff(async (session) => {
    const documentId = text((await readJson(request)).document_id);
    if (!documentId) return fail(400, "MISSING_FIELDS", "document_id가 필요합니다.");
    return Response.json(await getBackend().runPromotion(documentId, session.store_id));
  });
}
