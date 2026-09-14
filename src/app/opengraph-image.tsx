import {
  ogImageAlt as alt,
  ogImageSize as size,
  ogImageContentType as contentType,
  renderOgImage,
} from "./shared-og-image";

// Náhledový obrázek appky při sdílení odkazu (WhatsApp, Messenger,
// Slack, iMessage...) -- appka dřív neměla nastavený žádný `og:image`,
// takže se v náhledu nezobrazovalo vůbec nic, ani logo (12.9.2026).
// Platí jako výchozí pro celou appku -- jednotlivé stránky si mohou
// v budoucnu založit vlastní `opengraph-image.tsx` ve svém adresáři,
// který by měl přednost jen pro tu konkrétní routu. Skutečná šablona
// je ve sdíleném `shared-og-image.tsx` (viz i `twitter-image.tsx`).
export { alt, size, contentType };

export default function Image() {
  return renderOgImage();
}
