import type { MetadataRoute } from "next";

// Web App Manifest (6.9.2026) -- appka dřív měla jen icon.svg
// (favicon v záložce), ale žádnou ikonu pro "Přidat na plochu" na
// Androidu (ten ji bere z týhle manifest.icons, ne z favicony). Na
// iOS řeší stejný problém apple-icon.png (viz src/app/apple-icon.png)
// -- Safari SVG v záložce umí, ale u "Přidat na plochu" ho ignoruje
// a čeká vyhrazené PNG.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Klopi",
    short_name: "Klopi",
    description: "Tipuj sportovní zápasy s kamarády a porovnej se v žebříčku.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f6",
    theme_color: "#16a34a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
