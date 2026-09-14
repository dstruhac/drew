import {
  ogImageAlt as alt,
  ogImageSize as size,
  ogImageContentType as contentType,
  renderOgImage,
} from "./shared-og-image";

// Stejný náhledový obrázek jako `opengraph-image.tsx`, jen pro X
// (dřív Twitter) -- ten se na `og:image` nemusí vždy spolehnout a
// čte vyhrazeně `twitter:image`. Šablona je sdílená, viz
// `shared-og-image.tsx`.
export { alt, size, contentType };

export default function Image() {
  return renderOgImage();
}
