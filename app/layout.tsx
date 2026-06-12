import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  weight: ["400", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "WildEye Analyzer",
  description: "Analyze camera-trap photos and export wildlife logs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${hanken.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body
        className={`${hanken.className} flex min-h-screen bg-background text-on-surface`}
        style={{ backgroundColor: "#101511", color: "#dfe4dd" }}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
