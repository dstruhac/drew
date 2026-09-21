import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CompetitionCard } from "@/components/competition-card";
import { SpotlightMatchCard } from "@/components/spotlight-match-card";
import { BadgeCenter } from "@/components/badge-center";
import { JoinCompetitionsModal } from "@/components/join-competitions-modal";
import { ExpandableList } from "@/components/expandable-list";
import { competitionFallbackSport } from "@/lib/sport";
import { UPCOMING_WINDOW_DAYS } from "@/lib/upcoming-window";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildMatchLogos } from "@/lib/team-logos";
import { findSharedMatchIds } from "@/lib/shared-matches";
import { topWinnerNames } from "@/lib/hecovacka-standings";
import type { CompetitionSport } from "@/lib/supabase/database.types";

// Vstupní stránka appky po přihlášení (nahrazuje dřívější /spaces,
// odsouhlaseno s uživatelem 29.8.2026 přes AskUserQuestion). Tři
// sekce: vysvícený nejbližší netipovaný zápas napříč VŠEMI soutěžemi
// hráče (ne jen jednou jako na /spaces/[id]), soutěže, které hráč
// hraje (jen ty, kde je competition_participants -- ne všechny
// soutěže v appce jako dřív), a sbírka medailí za vítězství týdne
// napříč soutěžemi. /spaces (přehled/prokliknutí VŠECH soutěží)
// zůstává dostupné přes odkaz níže.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Nejdřív zjistit, které soutěže hráč hraje -- zbytek dotazů na tom
  // závisí (filtrují se podle nich). getCurrentUser() není síťový
  // dotaz (viz komentář u něj v server.ts), takže tahle závislost nic
  // nestojí navíc.
  const { data: participantRows, error: participantRowsError } = await supabase
    .from("competition_participants")
    .select(
      "competitions(id, name, sport, logo_url, description, visibility, status)",
    )
    .eq("user_id", user?.id ?? "");

  throwIfSupabaseError(participantRowsError, "Načtení hráčových soutěží");

  const myAllCompetitions = (participantRows ?? [])
    .map((row) => row.competitions)
    .filter((c): c is NonNullable<typeof c> => c !== null);
  // Hecovačky (soukromé soutěže) appka ukazuje ve vlastní sekci níže,
  // ne zamíchané mezi oficiálními ligami v "Tvoje soutěže".
  const myCompetitions = myAllCompetitions.filter((c) => c.visibility === "public");
  const myHecovacky = myAllCompetitions.filter((c) => c.visibility === "private");

  // Zbytek dotazů (spotlight zápas, žebříčky, medaile) jede přes VŠECHNY
  // soutěže hráče, hecovačky nevyjímaje -- jen rozdělení na dvě sekce
  // výše je kosmetické.
  const competitionIds = myAllCompetitions.map((c) => c.id);
  const sportByCompetition = new Map(myAllCompetitions.map((c) => [c.id, c.sport]));

  const [
    allParticipantsResult,
    predictionsResult,
    upcomingMatchesResult,
    weeklyBadgesResult,
    profileResult,
    totalCompetitionsResult,
    allCompetitionsResult,
  ] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("competition_participants")
          .select("competition_id, user_id, profiles!user_id(display_name)")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("predictions")
          .select("match_id, user_id, points, matches!inner(competition_id)")
          .in("matches.competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("matches")
          .select(
            "id, competition_id, home_team, away_team, kickoff_at, status, home_score, away_score, sport, source_match_id, external_id",
          )
          .in("competition_id", competitionIds)
          .eq("status", "scheduled")
          .gt("kickoff_at", new Date().toISOString())
          .order("kickoff_at", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    // Bez filtru na user_id -- BadgeCenter potřebuje vidět i cizí
    // medaile v soutěžích, které hráč hraje, aby ho o nich mohl
    // informovat (viz níže myBadges/othersNewBadges).
    competitionIds.length
      ? supabase
          .from("weekly_badges")
          .select("competition_id, week_start, user_id, points, competitions(name, sport), profiles(display_name)")
          .in("competition_id", competitionIds)
          .order("week_start", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("profiles")
      .select("badges_seen_through")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    // "Tvoje soutěže (X/Y)" počítá jen VEŘEJNÉ soutěže appky -- soukromé
    // hecovačky mají vlastní sekci/přehled (/hecovacky) bez podobného
    // poměru (appka jich může mít libovolně, nedávalo by smysl je
    // sčítat do jednoho čísla s oficiálními ligami appky).
    supabase
      .from("competitions")
      .select("*", { count: "exact", head: true })
      .eq("visibility", "public"),
    supabase
      .from("competitions")
      .select("id, name, sport, logo_url, description")
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
  ]);

  throwIfSupabaseError(allParticipantsResult.error ?? null, "Načtení účastníků soutěží");
  throwIfSupabaseError(predictionsResult.error ?? null, "Načtení tipů");
  throwIfSupabaseError(upcomingMatchesResult.error ?? null, "Načtení nadcházejících zápasů");
  throwIfSupabaseError(weeklyBadgesResult.error ?? null, "Načtení medailí");
  throwIfSupabaseError(profileResult.error ?? null, "Načtení profilu");
  throwIfSupabaseError(totalCompetitionsResult.error ?? null, "Načtení počtu soutěží");
  throwIfSupabaseError(allCompetitionsResult.error ?? null, "Načtení seznamu soutěží");

  const allParticipants = allParticipantsResult.data;
  const predictions = predictionsResult.data;
  const upcomingMatches = upcomingMatchesResult.data;
  const weeklyBadges = weeklyBadgesResult.data;
  const profileRow = profileResult.data;
  const totalCompetitionsCount = totalCompetitionsResult.count;

  // Soutěže, které hráč ještě nehraje -- nabídne se mu je
  // JoinCompetitionsModal, pokud zatím nehraje žádnou (viz níže).
  const myCompetitionIds = new Set(competitionIds);
  const unjoinedCompetitions = (allCompetitionsResult.data ?? []).filter(
    (c) => !myCompetitionIds.has(c.id),
  );

  // Vysvícený zápas: chronologicky nejbližší (matches jsou už seřazené
  // vzestupně z dotazu výše) zápas napříč soutěžemi hráče, který ještě
  // nemá tip -- stejná technika jako "Ještě netipováno" na
  // /spaces/[id], jen napříč soutěžemi místo v jedné.
  const ownPredictedMatchIds = new Set(
    (predictions ?? [])
      .filter((p) => p.user_id === user?.id)
      .map((p) => p.match_id),
  );
  const spotlightMatch =
    (upcomingMatches ?? []).find((m) => !ownPredictedMatchIds.has(m.id)) ?? null;

  // Loga -- u zápasu zkopírovaného z jiné soutěže (hecovačka) se hledají
  // pod PŮVODNÍ soutěží, viz src/lib/team-logos.ts. Jen jeden zápas
  // (vysvícená kartička), takže se to vyplatí dohledat rovnou tady,
  // ne předem tahat loga pro VŠECHNY soutěže hráče (dřívější přístup
  // -- appka logo potřebovala jen pro tenhle jeden zápas).
  const spotlightLogos = spotlightMatch
    ? (await buildMatchLogos(supabase, [spotlightMatch])).get(spotlightMatch.id) ?? {}
    : {};

  // Trvalý příznak "Tip je sdílen do více soutěží", viz
  // src/lib/shared-matches.ts.
  const spotlightSharedMatchIds = spotlightMatch
    ? await findSharedMatchIds(supabase, [spotlightMatch], user?.id)
    : new Set<string>();

  // "Vše natipováno" značka na kartičce soutěže (6.9.2026, na žádost
  // uživatele) -- stejné okno jako na /spaces/[id]
  // (UPCOMING_WINDOW_DAYS), na rozdíl od `upcomingMatches` výše
  // (bez horní hranice -- vysvícený zápas se má najít i dál než 7 dní
  // dopředu, pokud hráč nemá nic bližšího). Počítá se tu proto
  // zvlášť, ne přefiltrováním `spotlightMatch`.
  const upcomingWindowEnd = new Date(
    Date.now() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const missingCompetitionIds = new Set(
    (upcomingMatches ?? [])
      .filter(
        (m) => !ownPredictedMatchIds.has(m.id) && new Date(m.kickoff_at) <= upcomingWindowEnd,
      )
      .map((m) => m.competition_id),
  );

  // Pozice v žebříčku za soutěž -- stejný výpočet jako na /spaces,
  // jen nad menší množinou (jen soutěže, kde hráč skutečně je).
  const standingsByCompetition = new Map<
    string,
    { userId: string; displayName: string; totalPoints: number }[]
  >();
  for (const participant of allParticipants ?? []) {
    const list = standingsByCompetition.get(participant.competition_id) ?? [];
    list.push({
      userId: participant.user_id,
      displayName: participant.profiles?.display_name ?? "Neznámý hráč",
      totalPoints: 0,
    });
    standingsByCompetition.set(participant.competition_id, list);
  }
  for (const prediction of predictions ?? []) {
    if (prediction.points === null) continue;
    const competitionId = prediction.matches?.competition_id;
    if (!competitionId) continue;
    const entry = standingsByCompetition
      .get(competitionId)
      ?.find((e) => e.userId === prediction.user_id);
    if (entry) entry.totalPoints += prediction.points;
  }
  const rankByCompetition = new Map<string, { rank: number; total: number }>();
  for (const [competitionId, standings] of standingsByCompetition) {
    standings.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        a.displayName.localeCompare(b.displayName, "cs"),
    );
    const index = standings.findIndex((e) => e.userId === user?.id);
    if (index !== -1) {
      rankByCompetition.set(competitionId, {
        rank: index + 1,
        total: standings.length,
      });
    }
  }

  // Medaile za vítězství týdne: myBadges je celá historie vlastních
  // medailí (Sbírka artefaktů), myNewBadges/othersNewBadges jsou jen
  // ty udělené PO badges_seen_through -- to řídí, jestli BadgeCenter
  // zobrazí gratulační modal (vyhrál jsem), informační banner (vyhrál
  // někdo jiný), nebo nic (nulový týden / appka to hráč viděl).
  const allBadges = weeklyBadges ?? [];
  const myBadges = allBadges.filter((b) => b.user_id === user?.id);
  const seenThrough = profileRow?.badges_seen_through ?? null;
  const newBadges = seenThrough
    ? allBadges.filter((b) => b.week_start > seenThrough)
    : allBadges;
  const myNewBadges = newBadges.filter((b) => b.user_id === user?.id);
  const othersNewBadges = newBadges.filter((b) => b.user_id !== user?.id);
  // newBadges je seřazené sestupně (viz dotaz výše), takže první
  // položka nese nejnovější week_start -- přesně po tenhle týden se
  // má watermark posunout, až hráč modal/banner zavře.
  const markSeenThrough = newBadges.length > 0 ? newBadges[0].week_start : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:max-w-5xl sm:px-10">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
      </header>

      <JoinCompetitionsModal
        competitions={unjoinedCompetitions}
        shouldOpenInitially={myCompetitions.length === 0}
      />

      <BadgeCenter
        myBadges={myBadges}
        myNewBadges={myNewBadges}
        othersNewBadges={othersNewBadges}
        markSeenThrough={markSeenThrough}
      >
        <section className="flex flex-col gap-3">
          {spotlightMatch ? (
            <SpotlightMatchCard
              match={spotlightMatch}
              isJoined={true}
              sport={competitionFallbackSport(sportByCompetition.get(spotlightMatch.competition_id))}
              competitionId={spotlightMatch.competition_id}
              logos={spotlightLogos}
              isSharedMatch={spotlightSharedMatchIds.has(spotlightMatch.id)}
              infoTooltip="Zde zadávej tipy na nejbližší zápasy ze všech tvých hraných soutěží."
            />
          ) : myCompetitions.length > 0 ? (
            <p className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
              ✅ Máš vyplněné tipy na všechno, co se blíží.
            </p>
          ) : (
            <p className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
              👋 Zatím nehraješ žádnou soutěž. Mrkni na{" "}
              <Link
                href="/spaces"
                className="font-bold text-accent underline underline-offset-2"
              >
                Všechny soutěže
              </Link>{" "}
              a přidej se.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">
              Tvoje soutěže{" "}
              <span className="text-faint-foreground">
                ({myCompetitions.length}/{totalCompetitionsCount ?? myCompetitions.length})
              </span>
            </h2>
            <Link
              href="/spaces"
              className="text-xs font-bold text-accent hover:underline"
            >
              Procházet všechny soutěže →
            </Link>
          </div>

          {myCompetitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádná -- vyber si soutěž v nabídce, nebo klikni na{" "}
              <Link href="/spaces" className="font-bold text-accent underline underline-offset-2">
                Procházet všechny soutěže
              </Link>
              .
            </p>
          ) : (
            <ExpandableList
              initialCount={myCompetitions.length}
              carouselItems={myCompetitions.map((competition) => (
                <DashboardCompetitionListItem
                  key={competition.id}
                  competition={competition}
                  rank={rankByCompetition.get(competition.id) ?? null}
                  allCaughtUp={!missingCompetitionIds.has(competition.id)}
                  winners={topWinnerNames(standingsByCompetition.get(competition.id) ?? [])}
                  layout="carousel"
                />
              ))}
              stackItems={myCompetitions.map((competition) => (
                <DashboardCompetitionListItem
                  key={competition.id}
                  competition={competition}
                  rank={rankByCompetition.get(competition.id) ?? null}
                  allCaughtUp={!missingCompetitionIds.has(competition.id)}
                  winners={topWinnerNames(standingsByCompetition.get(competition.id) ?? [])}
                  layout="stack"
                />
              ))}
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">
              Tvoje hecovačky{" "}
              <span className="text-faint-foreground">({myHecovacky.length})</span>
            </h2>
            <Link href="/hecovacky" className="text-xs font-bold text-accent hover:underline">
              Všechny hecovačky →
            </Link>
          </div>

          {myHecovacky.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádná -- soukromá sázka mezi kamarády, kterou si sám(a) založíš. Mrkni na{" "}
              <Link href="/hecovacky/nova" className="font-bold text-accent underline underline-offset-2">
                Založit hecovačku
              </Link>
              .
            </p>
          ) : (
            <ExpandableList
              initialCount={myHecovacky.length}
              carouselItems={myHecovacky.map((competition) => (
                <DashboardCompetitionListItem
                  key={competition.id}
                  competition={competition}
                  rank={rankByCompetition.get(competition.id) ?? null}
                  allCaughtUp={!missingCompetitionIds.has(competition.id)}
                  winners={topWinnerNames(standingsByCompetition.get(competition.id) ?? [])}
                  isStake
                  layout="carousel"
                />
              ))}
              stackItems={myHecovacky.map((competition) => (
                <DashboardCompetitionListItem
                  key={competition.id}
                  competition={competition}
                  rank={rankByCompetition.get(competition.id) ?? null}
                  allCaughtUp={!missingCompetitionIds.has(competition.id)}
                  winners={topWinnerNames(standingsByCompetition.get(competition.id) ?? [])}
                  isStake
                  layout="stack"
                />
              ))}
            />
          )}
        </section>
      </BadgeCenter>
    </main>
  );
}

// Kartička soutěže zabalená do <li> se stejnou logikou šířky jako
// MatchCard na /spaces/[id] (18.9.2026, na žádost uživatele: "chtěl
// bych mít stejně tak řešené i soutěže na dashboardu" -- appka tam
// zápasy zobrazuje jako swipe carousel na mobilu). ExpandableList je
// Client Component a tahle stránka Server Component -- přes tuhle
// hranici nejde poslat funkci (jen hotové React elementy, viz stejný
// důvod zdokumentovaný u ExpandableList/MatchCard), proto je
// DashboardCompetitionListItem samostatná funkce volaná už tady na
// serveru, ne renderovaná uvnitř ExpandableList.
function DashboardCompetitionListItem({
  competition,
  rank,
  allCaughtUp,
  winners,
  isStake,
  layout,
}: {
  competition: {
    id: string;
    name: string;
    sport: CompetitionSport;
    logo_url: string | null;
    description: string | null;
    status: string;
  };
  rank: { rank: number; total: number } | null;
  allCaughtUp: boolean;
  winners: string[];
  isStake?: boolean;
  /** "carousel" = kartička má na mobilu fixní procentuální šířku (peek
   * dalšího řádku při swipu), "stack" = plná šířka (počítačová mřížka,
   * appka tam carousel vzhled nikdy nepoužívá). */
  layout: "carousel" | "stack";
}) {
  const layoutClass =
    layout === "carousel" ? "w-[85%] shrink-0 snap-start sm:w-auto sm:shrink" : "";

  return (
    <li className={layoutClass}>
      <CompetitionCard
        competition={competition}
        rank={rank}
        allCaughtUp={allCaughtUp}
        isArchived={competition.status === "archived"}
        winners={winners}
        isStake={isStake}
      />
    </li>
  );
}
