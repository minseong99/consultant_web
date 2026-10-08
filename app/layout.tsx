import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "KT 매장 상담 지원 AI Agent",
  description: "KT 매장 상담 지원",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        {/* 창이 좁아질 때 화면 전체를 같은 비율로 줄인다. 첫 그림이 그려지기 전에 적용되도록 가장 먼저 싣는다. */}
        <Script src="/viewport-scale.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
