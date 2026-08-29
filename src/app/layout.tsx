import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Součást vybraného vizuálního směru "Svěží a čisté" (redesign,
// 29.8.2026) -- nahrazuje dřívější Geist, který appka kvůli
// přebitému `font-family` v globals.css stejně nikdy reálně
// nezobrazovala.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Drew",
  description: "Tipovací hra na sportovní zápasy",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
