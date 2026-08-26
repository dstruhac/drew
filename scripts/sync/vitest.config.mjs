import { defineConfig } from "vitest/config";

export default defineConfig({
  css: {
    // Vite ve výchozím stavu hledá postcss.config.* i v nadřazených
    // adresářích — v CI tak najde konfiguraci hlavní Next.js appky
    // (postcss.config.mjs, potřebuje @tailwindcss/postcss), kterou
    // scripts/sync vůbec nemá nainstalovanou, a spadne. Testy tady
    // žádné CSS nepotřebují, takže se hledání zkratuje prázdnou
    // vloženou konfigurací.
    postcss: {},
  },
});
