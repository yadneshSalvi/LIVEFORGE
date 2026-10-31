import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2",
      weight: "700",
    },
  ],
  variable: "--font-body",
  display: "swap",
});
const space = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2",
      weight: "600",
    },
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2",
      weight: "700",
    },
  ],
  variable: "--font-display",
  display: "swap",
});
const mono = localFont({
  src: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LIVEFORGE — Your community invents the next law",
    template: "%s · LIVEFORGE",
  },
  description:
    "A live adventure shaped by your community. Twitch viewers invent mechanics, you approve them, and the game changes while you play.",
  applicationName: "LIVEFORGE",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: "#0c1118",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${space.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
