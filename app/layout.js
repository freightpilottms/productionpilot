import "./globals.css";
import "./ui-overrides.css";
import AppShell from "@/app/_ui/AppShell";

export const metadata = {
  title: "BeCleven – RAJ App",
  description: "BeCleven – RAJ App",
  manifest: "/manifest.json",
  other: {
    google: "notranslate",
  },
  appleWebApp: {
    capable: true,
    title: "RAJ App",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/icons/apple-touch-icon-152.png", sizes: "152x152", type: "image/png" },
      { url: "/icons/apple-touch-icon-120.png", sizes: "120x120", type: "image/png" },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1220",
};

export default function RootLayout({ children }) {
  return (
    <html lang="bs" data-theme="dark" translate="no" className="notranslate">
      <AppShell>{children}</AppShell>
    </html>
  );
}
