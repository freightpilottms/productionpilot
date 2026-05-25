"use client";

import { usePathname } from "next/navigation";
import Footer from "./Footer";

export default function FooterGate() {
  const pathname = usePathname() || "/";

  // ✅ Samo ove rute imaju footer
  const allow = pathname === "/" || pathname === "/home" || pathname === "/vise";

  if (!allow) return null;
  return <Footer />;
}
