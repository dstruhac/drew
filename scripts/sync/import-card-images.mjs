// Jednorázový import fotek pro sběratelské karty (6.9.2026) -- ke
// každé kartě v katalogu (`cards`, viz
// supabase/migrations/20260906160000_cards.sql) najde a stáhne fotku z
// Pexels (bezplatná knihovna, reální lidé, licence "free to use,
// no attribution required") podle vyhledávacího dotazu přiřazeného ke
// kartě, nahraje do Supabase Storage (bucket "cards") a zapíše
// `cards.image_url`.
//
// Fotky jsou schválně anonymní/nekonkrétní (odpovídají "duchu" karty,
// ne žádné konkrétní osobě) -- appka nezobrazuje podobiznu žádné
// reálné, identifikovatelné osoby. `image_url` jde kdykoliv v
// budoucnu ručně vyměnit (např. za fotku konkrétního kamaráda) beze
// změny appky/kódu.
//
// Běží jen v GitHub Actions (import-card-images.yml, ruční spuštění),
// protože potřebuje PEXELS_API_KEY a přístup na cizí doménu
// (api.pexels.com) -- ani jedno tahle sandbox session nemá.
//
// Idempotentní/bezpečné pro re-run: karta, která už image_url má, se
// přeskočí -- ruční spuštění navíc (např. po přidání dalších karet do
// katalogu) tak nestahuje znovu fotky, které appka už má.

import { createSupabaseClient } from "./lib/supabase-client.mjs";

// Vyhledávací dotaz na Pexels pro každou kartu (id -> query) -- zvolený
// tak, aby odpovídal duchu karty (viz flavor_text v migraci), ne
// konkrétní osobě.
const SEARCH_QUERY_BY_CARD_ID = {
  1: "amateur soccer player celebrating goal outdoor",
  2: "amateur football defender muddy field",
  3: "goalkeeper diving save amateur match",
  4: "amateur football midfielder running park",
  5: "football player sliding tackle mud",
  6: "amateur football striker sprinting pitch",
  7: "ice hockey player action shot rink",
  8: "female soccer player kicking ball",
  9: "ice hockey goalie save",
  10: "football captain celebrating with team",
};

async function searchPexelsPhoto(apiKey, query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });
  if (!res.ok) throw new Error(`Pexels vyhledávání "${query}" selhalo: HTTP ${res.status}`);
  const body = await res.json();
  const photo = body.photos?.[0];
  if (!photo) throw new Error(`Pexels nevrátil žádnou fotku pro dotaz "${query}"`);
  return photo.src.large;
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Stažení obrázku ${url} selhalo: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadCardImage(supabase, cardId, buffer) {
  const path = `cards/${cardId}.jpg`;
  const { error } = await supabase.storage
    .from("cards")
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`Upload karty ${cardId} selhal: ${error.message}`);
  const { data } = supabase.storage.from("cards").getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("Chybí PEXELS_API_KEY v prostředí -- nastav ho jako GitHub secret.");
  }

  const supabase = createSupabaseClient();

  const { data: cards, error } = await supabase
    .from("cards")
    .select("id, name, image_url")
    .order("id", { ascending: true });
  if (error) throw new Error(`Nepodařilo se načíst katalog karet: ${error.message}`);

  let importedCount = 0;
  for (const card of cards ?? []) {
    if (card.image_url) {
      console.log(`#${card.id} ${card.name}: fotka už existuje, přeskakuji.`);
      continue;
    }
    const query = SEARCH_QUERY_BY_CARD_ID[card.id];
    if (!query) {
      console.log(`#${card.id} ${card.name}: chybí vyhledávací dotaz pro tuhle kartu, přeskakuji.`);
      continue;
    }

    console.log(`#${card.id} ${card.name}: hledám "${query}" na Pexels...`);
    const photoUrl = await searchPexelsPhoto(apiKey, query);
    const buffer = await downloadImage(photoUrl);
    const publicUrl = await uploadCardImage(supabase, card.id, buffer);

    const { error: updateError } = await supabase
      .from("cards")
      .update({ image_url: publicUrl })
      .eq("id", card.id);
    if (updateError) {
      throw new Error(`Uložení image_url pro kartu ${card.id} selhalo: ${updateError.message}`);
    }

    console.log(`#${card.id} ${card.name}: nahráno -> ${publicUrl}`);
    importedCount += 1;
  }

  console.log(`Hotovo: nahráno ${importedCount} nových fotek.`);
}

await main();
