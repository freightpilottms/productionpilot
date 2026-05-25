import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProductionPilot",
  description: "Modern production cockpit rebuilt for Vercel deployment"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
