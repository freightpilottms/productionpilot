import "./restaurant.css";

export const metadata = {
  title: "Restaurant App - BeCleven",
  description: "Demo aplikacija za vođenje narudžbi u restoranu.",
  manifest: "/restaurant-app/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Restaurant App",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#252322",
};

export default function RestaurantLayout({ children }) {
  return children;
}
