import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

/** PDF에서 글자를 꺼낸다. 글자가 없는 PDF(스캔본)는 text 가 거의 비어 있다. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { pages: totalPages, text: text.map((page) => page.trim()).filter(Boolean).join("\n\n") };
}
