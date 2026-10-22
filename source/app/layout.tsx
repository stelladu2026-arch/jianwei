import type { Metadata } from "next";
import "./globals.css";
import "./research-desk.css";
import "./sidebar-row-fix.css";

export const metadata: Metadata = {
  title: "见微 · 产品机会研究",
  description: "以证据为起点，形成可验证的产品机会判断。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
