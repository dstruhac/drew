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
  metadataBase: new URL("https://klopi.cz"),
  title: {
    default: "Klopi – tipovačka pro kámoše",
    template: "%s | Klopi",
  },
  description: "Tipuj sportovní zápasy s kamarády a porovnejte se v žebříčku.",
  openGraph: {
    type: "website",
    locale: "cs_CZ",
    url: "/",
    siteName: "Klopi",
    title: "Klopi – tipovačka pro kámoše",
    description: "Tipuj sportovní zápasy s kamarády a porovnejte se v žebříčku.",
  },
  twitter: {
    card: "summary",
    title: "Klopi – tipovačka pro kámoše",
    description: "Tipuj sportovní zápasy s kamarády a porovnejte se v žebříčku.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
