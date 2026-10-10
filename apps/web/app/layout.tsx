import type { Metadata, Viewport } from "next";
import { Albert_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Variable weight (covers 300/400/600) so the SOFT and WONK axes from Figma can load too.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
});
const albert = Albert_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-albert-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Hive — Agent memory, on Monad",
  description: "A visual permission layer for AI agent memory. Every edge is signed with your passkey and recorded on Monad.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${albert.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
