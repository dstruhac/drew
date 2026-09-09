import { CollectibleCard } from "@/components/collectible-card";

const demos = [
  {
    rarity: "basic" as const,
    title: "Pivní Guardiola",
    description: "Jedna výhra. Dost na řeči u stolu až do dalšího kola.",
    week: "W37/26",
    wins: 1,
    competitions: ["Premier League"],
    seriesNumber: "037-B",
  },
  {
    rarity: "rare" as const,
    title: "Okresní Nostradamus",
    description: "Dvě soutěže, dva zářezy. Náhoda už začíná být podezřelá.",
    week: "W37/26",
    wins: 2,
    competitions: ["Premier League", "Extraliga"],
    seriesNumber: "037-R",
  },
  {
    rarity: "legendary" as const,
    title: "Trenér z okresu",
    description: "Tři soutěže v jednom týdnu. Taktika nejasná. Výsledek legendární.",
    week: "W37/26",
    wins: 3,
    competitions: ["Premier League", "Extraliga", "Liga mistrů"],
    seriesNumber: "037-L",
  },
];

export default function CardLabPage() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-10 sm:px-8 lg:px-10">
      <header className="max-w-3xl">
        <div className="inline-flex rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          Visual prototype · bez změny DB
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-5xl">
          Klopi Weekly Cards
        </h1>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground sm:text-base">
          Stejná kompozice, tři paralelní rarity. Základní je poctivá sběratelská karta,
          vzácná přidává foil a legendární už má působit jako malý svátek. Místo
          „YOUR ARTWORK“ později přijde tvoje nahraná fotka nebo vlastní ilustrace.
        </p>
      </header>

      <section className="grid items-start gap-8 md:grid-cols-3">
        {demos.map((card) => (
          <div key={card.rarity} className="mx-auto w-full max-w-[340px]">
            <CollectibleCard {...card} />
            <div className="mt-5 px-1">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                {card.rarity === "basic"
                  ? "1 výhra · základní"
                  : card.rarity === "rare"
                    ? "2 výhry · vzácná"
                    : "3+ výhry · legendární"}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-[26px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-card)] sm:grid-cols-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-accent">Obsah</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Každá šablona dostane vlastní název, fotku/obraz, krátký popis a rarity.
          </p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-accent">Logika</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            1 výhra = basic, 2 = rare, 3+ = legendary. Vizuál je na výherní logice nezávislý.
          </p>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-accent">Další krok</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Po odsouhlasení vzhledu napojit reveal animaci, sbírku a administraci obrázků.
          </p>
        </div>
      </section>
    </main>
  );
}
