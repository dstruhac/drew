import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Sdílená šablona náhledového obrázku appky pro `opengraph-image.tsx`
// (og:image, čte většina appek -- WhatsApp, Messenger, Slack, iMessage,
// Signal...) i `twitter-image.tsx` (twitter:image, vyhrazeně čte X) --
// stejný obrázek pro oba, jen přes samostatný soubor, ať se appka
// nemusí spoléhat na to, že si X sám domyslí obrázek z og:image.
export const ogImageAlt = "Klopi – tipovačka pro kámoše";
export const ogImageSize = { width: 1200, height: 630 };
export const ogImageContentType = "image/png";

const badgeData = await readFile(
  join(process.cwd(), "public/icon-512.png"),
  "base64",
);
const badgeSrc = `data:image/png;base64,${badgeData}`;

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#faf9f6",
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 64,
            padding: "0 96px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeSrc} width={240} height={240} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 132,
                fontWeight: 800,
                color: "#15171c",
                letterSpacing: -4,
              }}
            >
              Klopi
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 40,
                fontWeight: 600,
                color: "#767b84",
                marginTop: 16,
              }}
            >
              Klobása. Pivo. Tipovačka.
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            height: 16,
            width: "100%",
            backgroundColor: "#16a34a",
          }}
        />
      </div>
    ),
    { ...ogImageSize },
  );
}
