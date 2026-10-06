import Image from "next/image";
// 로고 파일을 바꾸려면 public/ 에 새 파일을 넣고 아래 경로만 고친다 (배경이 투명한 PNG·SVG 권장).
import logo from "@/public/kt-logo.jpg";

// 서비스 표기. size: sm(고객 접수·사이드바), md(첫 화면·로그인)
export function Wordmark({ size = "md", label = "매장 상담 지원" }: { size?: "sm" | "md"; label?: string }) {
  const height = size === "md" ? "h-7" : "h-5";
  const text = size === "md" ? "text-[16px]" : "text-[14px]";
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src={logo} alt="KT" priority className={`w-auto shrink-0 ${height}`} />
      <span className={`font-bold tracking-tight text-ink ${text}`}>{label}</span>
    </span>
  );
}
