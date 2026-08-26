// Pomocný skript pro .github/workflows/playwright-probe.yml — na rozdíl
// od curl-based api-probe.yml spouští skutečný (neviditelný) Chrome,
// takže vidí i obsah, který se na stránku dostane až přes JavaScript.

import { chromium } from "playwright";

const url = process.env.PROBE_URL;
const waitSelector = process.env.WAIT_SELECTOR || null;
const extractSelector = process.env.EXTRACT_SELECTOR || null;
const extractAttr = process.env.EXTRACT_ATTR || null;
const maxItems = parseInt(process.env.MAX_ITEMS || "50", 10);
const maxChars = parseInt(process.env.MAX_CHARS || "3000", 10);
const takeScreenshot = process.env.SCREENSHOT === "true";

const browser = await chromium.launch();
const page = await browser.newPage({
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
});

console.log(`URL: ${url}`);
console.log("Načítám stránku (čekám, až se uklidní síťový provoz)...");
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

if (waitSelector) {
  console.log(`Čekám na selektor: ${waitSelector}`);
  await page.waitForSelector(waitSelector, { timeout: 15000 }).catch((e) => {
    console.log(
      `::warning::Selektor '${waitSelector}' se neobjevil do 15s (${e.message}) — pokračuju i tak, ale výsledek nemusí být úplný.`,
    );
  });
}

if (takeScreenshot) {
  await page.screenshot({ path: "screenshot.png", fullPage: true });
  console.log("Screenshot uložen (viz artifact tohoto běhu).");
}

if (extractSelector) {
  const items = extractAttr
    ? await page.$$eval(
        extractSelector,
        (els, attr) => els.map((el) => `[${attr}=${el.getAttribute(attr)}] ${el.textContent.trim()}`),
        extractAttr,
      )
    : await page.$$eval(extractSelector, (els) =>
        els.map((el) => el.textContent.trim()).filter(Boolean),
      );
  console.log(
    `----- Nalezeno ${items.length} prvků pro selektor: ${extractSelector} -----`,
  );
  items.slice(0, maxItems).forEach((text, i) => console.log(`${i + 1}: ${text}`));
  if (items.length > maxItems) {
    console.log(
      `::warning::Zobrazeno jen prvních ${maxItems} z ${items.length} nalezených — zvyš max_items, pokud potřebuješ zbytek.`,
    );
  }
} else {
  const html = await page.content();
  console.log(`----- Délka vykresleného HTML: ${html.length} znaků -----`);
  console.log(html.slice(0, maxChars));
  if (html.length > maxChars) {
    console.log("\n…(zkráceno — zvyš max_chars, pokud potřebuješ zbytek)");
  }
}

await browser.close();
