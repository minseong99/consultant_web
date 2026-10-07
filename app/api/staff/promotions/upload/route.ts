import { createHash } from "node:crypto";
import { fail, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { extractPdfText } from "@/lib/pdf";
import type { PromotionParseResult } from "@/lib/types";

export const maxDuration = 100;

// Vercel 함수가 받을 수 있는 요청 크기(약 4.5MB)보다 조금 작게 잡는다.
const MAX_BYTES = 4 * 1024 * 1024;
// 이보다 글자가 적으면 글자를 읽을 수 없는 PDF(스캔본)로 본다.
const MIN_TEXT = 40;
// AI에 넘기는 글자 수 한도. 넘으면 앞부분만 쓴다.
const MAX_TEXT = 60_000;

// 프로모션 PDF 업로드: 원본 보관 → 글자 추출 → 프로모션별로 나누기.
// 여기서는 등록하지 않는다. 직원이 결과를 확인한 뒤 /api/staff/promotions/register 로 한 건씩 등록한다.
export function POST(request: Request) {
  return withStaff(async (session) => {
    let file: unknown;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return fail(400, "INVALID_UPLOAD", "파일을 읽지 못했습니다.");
    }
    if (!(file instanceof File)) return fail(400, "MISSING_FIELDS", "PDF 파일을 선택해 주세요.");
    if (file.size > MAX_BYTES) return fail(413, "FILE_TOO_LARGE", "파일이 너무 큽니다. 4MB 이하의 PDF를 올려 주세요.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    // 확장자가 아니라 파일 앞머리로 PDF인지 확인한다.
    if (new TextDecoder("latin1").decode(bytes.subarray(0, 5)) !== "%PDF-") {
      return fail(400, "NOT_PDF", "PDF 파일만 올릴 수 있습니다.");
    }

    // 같은 파일을 다시 올리면 같은 경로에 덮어써서 원본이 쌓이지 않게 한다.
    // (추출이 버퍼를 가져가므로 해시와 보관용 사본을 먼저 만든다.)
    const path = `promotions/${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}.pdf`;
    const copy = bytes.slice();

    let extracted: { pages: number; text: string };
    try {
      extracted = await extractPdfText(bytes);
    } catch (error) {
      console.error(error);
      return fail(400, "UNREADABLE_PDF", "PDF를 열지 못했습니다. 파일이 손상되었거나 암호가 걸려 있을 수 있습니다.");
    }
    if (extracted.text.length < MIN_TEXT) {
      return fail(422, "NO_TEXT", "글자를 읽을 수 없는 PDF입니다(스캔본 등). [직접 입력]으로 등록해 주세요.");
    }

    const backend = getBackend();
    await backend.storePromotionFile(path, copy);

    const parsed = await backend.parsePromotions(extracted.text.slice(0, MAX_TEXT), file.name);
    if (!parsed.success) return Response.json(parsed, { status: 502 });

    // 이 매장에 같은 이름으로 이미 등록된 프로모션을 표시한다(다시 저장하지 않는다).
    const known = new Set((await backend.listPromotions(session.store_id)).map((row) => row.file_name.trim()));
    const promotions = parsed.promotions
      .filter((item) => item.promotion_name?.trim())
      .map((item) => ({ ...item, promotion_name: item.promotion_name.trim(), exists: known.has(item.promotion_name.trim()) }));
    if (promotions.length === 0) return fail(422, "NO_PROMOTION", "이 PDF에서 프로모션 정보를 찾지 못했습니다.");

    return Response.json({ success: true, file_name: file.name, file_path: path, pages: extracted.pages, promotions } satisfies PromotionParseResult);
  });
}
