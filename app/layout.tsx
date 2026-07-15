import type { Metadata } from "next";
import "@videojs/react/video/skin.css";
import "./globals.css";
import { PwaRegistrar } from "./components/PwaRegistrar";

export const metadata: Metadata = {
  metadataBase: new URL("https://contin-player.poychang.chatgpt.site"),
  title: "Contin — 你的連續播放空間",
  description: "匯入 MP4 播放清單、記住觀看進度，下一次從原本的位置繼續。",
  applicationName: "Contin Player",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Contin",
  },
  openGraph: {
    title: "Contin — 你的連續播放空間",
    description: "匯入、續播、接著看。讓每個播放清單都記得你看到哪裡。",
    type: "website",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contin — 你的連續播放空間",
    description: "匯入、續播、接著看。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>
        {children}
        <PwaRegistrar />
      </body>
    </html>
  );
}
