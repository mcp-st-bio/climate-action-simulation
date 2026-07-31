import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "기후변화로부터 지구를 지켜라!",
  description: "기후 협상 보드게임 진행 지원 앱 (교사용 프로토타입)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  );
}
