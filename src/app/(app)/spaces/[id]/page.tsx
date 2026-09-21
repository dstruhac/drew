import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Trophy,
  Users,
  Circle,
  Radio,
  CalendarOff,
  Flame,
  Rocket,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { computeWeeklyPoints } from "@/lib/week";
import { ExpandableList } from "@/components/expandable-list";
import {
  SpotlightMatchCard,
  TeamBadge,
  type Match,
} from "@/components/spotlight-match-card";
import { PredictionForm } from "./prediction-form";
import { ExactScoreCelebration } from "./exact-score-celebration";
import { HecovackaPanel } from "./hecovacka-panel";
import { HecovackaResultsCard } from "@/components/hecovacka-results-card";
import { joinCompetition, leaveCompetition } from "./actions";
import { formatRelativeKickoff } from "@/lib/format-kickoff";
import { competitionFallbackSport, sportAccentStyle } from "@/lib/sport";
import { UPCOMING_WINDOW_DAYS, upcomingWindowEndIso } from "@/lib/upcoming-window";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { buildMatchLogos, type MatchLogos } from "@/lib/team-logos";
import { findSharedMatchIds } from "@/lib/shared-matches";

// Porovná dvě data podle kalendářního dne v pražském čase -- appka
// ukazuje odložený zápas jen v den, kdy se měl původně hrát (viz
// sekce "Odloženo" níže), a "dnes" musí být podle Prahy, ne podle
// UTC serveru (appka jinde v appce taky vždycky zobrazuje časy podle
// Europe/Prague, viz spaces/[id]/page.tsx).
function isSameCalendarDayInPrague(a: Date, b: Date): boolean {
  const format = (d: Date) => d.toLocaleDateString("cs-CZ", { timeZone: "Europe/Prague" });
  return format(a) === format(b);
}

const SPORT_LABELS = { hockey: "Hokej", football: "Fotbal", mixed: "Mix" } as const;

// Výchozí počet zobrazených zápasů, než se musí kliknout na "Zobrazit
// všechny" (odsouhlaseno s uživatelem 27.8.2026, přeladěno 29.8.2026).
//
// "Nadcházející" se dál dělí na netipované (vysvícená kartička +
// pár dalších) a už tipnuté (sbalené jako "Proběhlé", limit níže) --
// odsouhlaseno s uživatelem 28.8.2026, protože pevný limit (dřív 8)
// míchal obojí dohromady a u anglických lig s 10 zápasy za víkend
// uřezával i netipované zápasy z pohledu.
const PAST_VISIBLE_COUNT = 5;
// Tvrdý strop na "Proběhlé" -- u soutěží se sezónou dlouhou už pár
// měsíců (Liga mistrů apod.) by "Zobrazit všechny" jinak odhalilo
// desítky až stovky starých zápasů, které jen překáží (18.9.2026, na
// žádost uživatele). Na rozdíl od `PAST_VISIBLE_COUNT` (kolik je vidět
// BEZ kliknutí) tohle je absolutní maximum i PO kliknutí na "Zobrazit
// všechny" -- appka staršího konce prostě nikdy neukáže.
const PAST_MAX_COUNT = 20;
const UPCOMING_PREDICTED_VISIBLE_COUNT = 3;
// Kolik dalších netipovaných zápasů appka ukáže VEDLE vysvícené
// kartičky, než se musí kliknout na "Zobrazit všechny" (odsouhlaseno
// s uživatelem 29.8.2026 -- dřív se počítalo z velikosti kola, což na
// širších obrazovkách stejně zabíralo hodně místa).
const UPCOMING_MISSING_EXTRA_VISIBLE_COUNT = 3;

// Sekce zápasů se na širších obrazovkách zobrazují jako mřížka místo
// jednoho úzkého sloupce -- redesign 29.8.2026, řeší reálný problém
// nahlášený uživatelem ("hodně zápasů zabírá hodně místa").
//
// Na mobilu (12.9.2026, na žádost uživatele) appka zápasy místo
// svislého sloupce ukazuje jako vodorovný swipe carousel (`flex` +
// `overflow-x-auto` + `snap-x` -- prohlížeč "přiskočí" vždy na celou
// kartičku, `snap-mandatory`). Karty samy potřebují doplňkové třídy
// (`shrink-0`, procentuální šířka, `snap-start` -- viz MatchCard níže),
// ať se ve `flex` řádku nezmáčknou na sebe. Od `sm:` šířky se appka
// vrací k mřížce beze změny chování -- carousel řeší jen to, že na
// mobilu je dřívější svislý sloupec zbytečně vysoký, na širší
// obrazovce už mřížka místo šetřila dost.
//
// Sekce BEZ tlačítka "Zobrazit všechny" ("Probíhající", "Odloženo") --
// mívají jen pár zápasů najednou, takže appka na obou šířkách ukazuje
// rovnou úplně všechno stejným (hybridním) seznamem. Sekce S tlačítkem
// ("Ještě netipováno", "Už tipnuto", "Proběhlé") mají tenhle carousel
// vzhled zase jinak řešený přímo v `ExpandableList` (12.9.2026, na
// žádost uživatele "do carouselu chci všechny zápasy, které je možné
// zobrazit v dané sekci" -- na mobilu appka carouselem ukazuje VŽDY
// úplně vše, žádné omezení; na počítači zůstává dřívější chování,
// jen prvních `initialCount` + tlačítko na odhalení zbytku v mřížce).
const MATCH_GRID_CLASSNAME =
  "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:snap-none sm:pb-0 lg:grid-cols-3";

export default async function CompetitionDetailPage({
  params,
}: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const upcomingWindowEnd = upcomingWindowEndIso();

  // Všech šest dotazů najednou v JEDNÉ vlně.
  //
  // Tipy (predictions) se dřív načítaly až v druhé vlně, protože se
  // filtrovaly seznamem ID zápasů z předchozího dotazu -- appka tedy
  // musela počkat na jedno kolo navíc. Teď se filtrují přes napojenou
  // tabulku zápasů (`matches!inner(...)` = jen tipy, jejichž zápas patří
  // do téhle soutěže), takže na nic čekat nemusí. Ušetří to celé jedno
  // kolo čekání na databázi při každém načtení stránky (perf analýza
  // 28.8.2026 -- jedno kolo stálo ~0,38 s).
  const [
    user,
    competitionResult,
    participantsResult,
    matchesResult,
    predictionsResult,
  ] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("competitions")
      .select("id, name, sport, logo_url, visibility, description, end_date, invite_token, created_by, status")
      .eq("id", id)
      .single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles!user_id(display_name)")
      .eq("competition_id", id),
    supabase
      .from("matches")
      .select(
        "id, home_team, away_team, kickoff_at, status, home_score, away_score, sport, source_match_id, overtime_flag, external_id",
      )
      .eq("competition_id", id)
      .order("kickoff_at", { ascending: true }),
    supabase
      .from("predictions")
      .select(
        "match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag, points, matches!inner(competition_id)",
      )
      .eq("matches.competition_id", id),
  ]);

  throwIfSupabaseError(competitionResult.error, "Načtení soutěže", ["PGRST116"]);
  throwIfSupabaseError(participantsResult.error, "Načtení účastníků soutěže");
  throwIfSupabaseError(matchesResult.error, "Načtení zápasů");
  throwIfSupabaseError(predictionsResult.error, "Načtení tipů");
  const competition = competitionResult.data;
  const participants = participantsResult.data;
  const matches = matchesResult.data;
  const predictions = predictionsResult.data;

  if (!competition) {
    notFound();
  }

  // Loga týmů -- u zápasů zkopírovaných z jiné soutěže (hecovačky) se
  // hledají pod PŮVODNÍ soutěží, ne pod touhle (viz src/lib/team-logos.ts
  // pro odůvodnění, proč to nejde řešit prostým sloučením podle jména).
  const matchLogos = await buildMatchLogos(
    supabase,
    (matches ?? []).map((m) => ({ ...m, competition_id: id })),
  );

  // Zápasy, co appka duplikuje i do jiné soutěže, kde hráč taky hraje
  // -- appka u nich formuláři ukáže trvalý příznak "Tip je sdílen do
  // více soutěží" (viz src/lib/shared-matches.ts).
  const sharedMatchIds = await findSharedMatchIds(supabase, matches ?? [], user?.id);

  const ownParticipant = participants?.find((p) => p.user_id === user?.id);
  const isJoined = ownParticipant !== undefined;

  const ownPredictionByMatch = new Map(
    predictions
      ?.filter((p) => p.user_id === user?.id)
      .map((p) => [p.match_id, p]),
  );

  // Tipy OSTATNÍCH hráčů na kartičce probíhajícího/proběhlého zápasu
  // (18.9.2026, na žádost uživatele) -- appka je vypisuje pod "Tvůj
  // tip", menším písmem. RLS (predictions_select_own_or_locked) appce
  // vrátí cizí tipy jen u zápasů, co už jsou odemčené (živé/dohrané),
  // takže appka tenhle seznam nemusí sama filtrovat podle stavu zápasu
  // -- u ještě zamčených zápasů `predictions` cizí řádky prostě
  // neobsahuje. Jméno appka bere z `participants` (`profiles`
  // nenapojené přímo v `predictions` dotazu výše), řazeno abecedně.
  const displayNameByUserId = new Map(
    (participants ?? []).map((p) => [p.user_id, p.profiles?.display_name ?? "Neznámý hráč"]),
  );
  const othersPredictionsByMatch = new Map<
    string,
    { userId: string; displayName: string; homeScore: number; awayScore: number; overtimeFlag: boolean }[]
  >();
  for (const prediction of predictions ?? []) {
    if (prediction.user_id === user?.id) continue;
    const list = othersPredictionsByMatch.get(prediction.match_id) ?? [];
    list.push({
      userId: prediction.user_id,
      displayName: displayNameByUserId.get(prediction.user_id) ?? "Neznámý hráč",
      homeScore: prediction.predicted_home_score,
      awayScore: prediction.predicted_away_score,
      overtimeFlag: prediction.predicted_overtime_flag ?? false,
    });
    othersPredictionsByMatch.set(prediction.match_id, list);
  }
  for (const list of othersPredictionsByMatch.values()) {
    list.sort((a, b) => a.displayName.localeCompare(b.displayName, "cs"));
  }

  // Hecovačka (soukromá soutěž, visibility === "private") -- druhá
  // vlna dotazů jen pro tenhle případ, ať běžné (veřejné) soutěže
  // nezatěžuje dotazem navíc, co by nikdy nepoužily (stejný princip
  // jako lazy MobileMenuCompetitions, viz PROJECT.md sekce "Výkon").
  const isOwner = competition.visibility === "private" && user?.id === competition.created_by;
  // Hecovačka po uplynutí end_date (archivuje hecovacky.mjs) --
  // appka se "zakonzervuje": zmizí pozvánka/přidávání hráčů, týdenní
  // žebříček a "Nadcházející" (žádné další zápasy nepřibydou), místo
  // toho se ukáže vyhodnocení vítězů (uživatel 21.9.2026, viz
  // HecovackaResultsCard).
  const isArchived = competition.status === "archived";
  let sourceNames: string[] = [];
  let candidates: { id: string; display_name: string }[] = [];
  if (competition.visibility === "private") {
    const [sourcesResult, profilesResult] = await Promise.all([
      supabase
        .from("hecovacka_sources")
        .select("competitions!source_competition_id(name)")
        .eq("hecovacka_id", id),
      // Kandidáti na přidání appka potřebuje jen pro tvůrce -- ostatní
      // participanti UI na přidávání vůbec neuvidí (HecovackaPanel).
      isOwner
        ? supabase.from("profiles").select("id, display_name").order("display_name")
        : Promise.resolve({ data: [], error: null }),
    ]);
    throwIfSupabaseError(sourcesResult.error, "Načtení zdrojových soutěží hecovačky");
    throwIfSupabaseError(profilesResult.error ?? null, "Načtení hráčů appky");

    sourceNames = (sourcesResult.data ?? [])
      .map((s) => s.competitions?.name)
      .filter((name): name is string => Boolean(name));
    const participantIds = new Set((participants ?? []).map((p) => p.user_id));
    candidates = (profilesResult.data ?? []).filter((p) => !participantIds.has(p.id));
  }
  const inviteUrl =
    isOwner && competition.invite_token ? `https://klopi.cz/pozvanka/${competition.invite_token}` : null;

  // Vlastní pozice v žebříčku pod hlavičkou soutěže (odsouhlaseno
  // s uživatelem 29.8.2026) -- stejný výpočet jako na
  // /spaces/[id]/leaderboard a na přehledu soutěží, jen z dat, která
  // tahle stránka už má načtená (žádný nový dotaz navíc).
  const standings = (participants ?? []).map((p) => ({
    userId: p.user_id,
    displayName: p.profiles?.display_name ?? "Neznámý hráč",
    totalPoints: 0,
  }));
  for (const prediction of predictions ?? []) {
    if (prediction.points === null) continue;
    const entry = standings.find((e) => e.userId === prediction.user_id);
    if (entry) entry.totalPoints += prediction.points;
  }
  standings.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName, "cs"),
  );
  const ownRankIndex = standings.findIndex((e) => e.userId === user?.id);
  const ownRank =
    ownRankIndex !== -1
      ? { rank: ownRankIndex + 1, total: standings.length }
      : null;

  // Banner "jak si vedu tenhle týden" hned pod hlavičkou soutěže
  // (14.9.2026, na žádost uživatele "at je hned videt") -- stejný
  // výpočet jako živý týdenní žebříček na /spaces/[id]/leaderboard
  // (sdílené computeWeeklyPoints v src/lib/week.ts), jen z dat, která
  // tahle stránka už má načtená (žádný nový dotaz navíc).
  const weekly = computeWeeklyPoints(matches ?? [], predictions ?? []);
  const weeklyRanked = [...weekly.participantIds]
    .map((userId) => ({
      userId,
      points: weekly.pointsByUser.get(userId) ?? 0,
    }))
    .sort((a, b) => b.points - a.points);
  const ownWeeklyRankIndex = user
    ? weeklyRanked.findIndex((e) => e.userId === user.id)
    : -1;
  const ownWeeklyRank =
    ownWeeklyRankIndex !== -1
      ? { rank: ownWeeklyRankIndex + 1, total: weeklyRanked.length }
      : null;
  const ownWeeklyPoints = user ? weekly.pointsByUser.get(user.id) ?? 0 : 0;

  return (
    <main
      style={sportAccentStyle(competition.sport)}
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:max-w-5xl sm:px-10"
    >
      <header>
        <div className="flex items-center gap-2 text-xs font-bold text-faint-foreground">
          <Link
            href="/dashboard"
            className="transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <span>·</span>
          <Link
            href="/spaces"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
            Soutěže
          </Link>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white">
            {competition.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={competition.logo_url}
                alt=""
                className="h-7 w-7 object-contain"
              />
            ) : (
              <Trophy className="h-5 w-5 text-accent" strokeWidth={2} />
            )}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{competition.name}</h1>
        </div>

        <div className="mt-2 flex items-center gap-4 pl-[52px] text-xs font-semibold text-muted-foreground">
          <span className="rounded-full border border-border-subtle px-2 py-0.5">
            {SPORT_LABELS[competition.sport]}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={2.2} />
            {participants?.length ?? 0} hráč
            {(participants?.length ?? 0) === 1 ? "" : "ů"}
          </span>
          {ownRank && (
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
              Celkově: {ownRank.rank}. místo z {ownRank.total}
            </span>
          )}
        </div>

        <div className="mt-4">
          {/* Pompézní CTA (14.9.2026, na žádost uživatele "tlačítko
           * větší, viditelnější, pompéznější") -- větší, s vlastním
           * gradientem ve sportovní barvě a jemným pulzujícím "sonar"
           * halo (viz .btn-hero v globals.css), ať je jasné, že tohle je
           * hlavní akce na stránce, dokud hráč soutěž nehraje. Dřívější
           * samostatné tlačítko "Žebříček →" tady vedle bylo odstraněno
           * (14.9.2026, na žádost uživatele "jsou tam dvě") -- tuhle roli
           * teď přebírá banner "tenhle týden" níž.
           * Soukromá soutěž (hecovačka) nemá samoobslužné "Chci hrát"
           * -- RLS to teď stejně odmítne (viz
           * 20260914090300_competition_participants_hecovacky.sql),
           * navíc kdokoliv, kdo hecovačku vůbec vidí, už je jejím
           * tvůrcem nebo participantem (competitions_select_visible),
           * takže !isJoined u ní reálně nikdy nenastane. */}
          {!isJoined && competition.visibility === "public" && (
            <form action={joinCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="btn-press btn-hero flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--accent),color-mix(in_srgb,var(--accent)_55%,white))] px-7 py-3.5 text-sm font-extrabold text-accent-foreground hover:brightness-105"
              >
                <Rocket className="h-4 w-4" strokeWidth={2.4} />
                Chci hrát
              </button>
            </form>
          )}
        </div>
      </header>

      {!isJoined && competition.visibility === "public" && (
        <div className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
          👋 Ještě nehraješ tuhle soutěž. Klikni na „Chci hrát“ výše a začni
          tipovat zápasy!
        </div>
      )}

      {competition.visibility === "private" && (
        <HecovackaPanel
          competitionId={competition.id}
          isOwner={isOwner}
          isArchived={isArchived}
          description={competition.description}
          endDate={competition.end_date}
          sourceNames={sourceNames}
          participants={(participants ?? []).map((p) => ({
            userId: p.user_id,
            displayName: p.profiles?.display_name ?? "Neznámý hráč",
          }))}
          candidates={candidates}
          inviteUrl={inviteUrl}
        />
      )}

      {isArchived && (
        <HecovackaResultsCard
          standings={standings}
          sport={competitionFallbackSport(competition.sport)}
          competitionId={competition.id}
        />
      )}

      {/* "Jak si vedu tenhle týden" hned pod hlavičkou (14.9.2026, na
       * žádost uživatele "at je hned videt") -- zobrazuje se VŽDY
       * (14.9.2026, uživatel upřesnil "ten banner se na strance
       * souteze musi zobrazovat vzdy" -- appka po odstranění
       * dřívějšího samostatného tlačítka "Žebříček →" z hlavičky měla
       * tenhle banner jako jediný proklik na žebříček ze stránky
       * soutěže, ale zobrazoval se jen přihlášeným v týdnu s odehraným
       * zápasem, takže appka v ostatních případech neměla na žebříček
       * z týhle stránky vůbec žádný proklik). Text se přizpůsobuje
       * situaci, odkaz na žebříček zůstává vždy stejný.
       *
       * Skončená hecovačka (isArchived) tenhle banner nemá -- týdenní
       * žebříček je koncept pro BĚŽÍCÍ soutěž, u uzavřené jednorázové
       * hecovačky je matoucí ("tenhle týden se nehraje", i když appka
       * myslí "už se nikdy hrát nebude"). Vyhodnocení je místo toho v
       * HecovackaResultsCard výše. */}
      {!isArchived && (
        <Link
          href={`/spaces/${competition.id}/leaderboard`}
          className="btn-press flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/[0.06] px-4 py-3 transition-colors hover:bg-accent/[0.1]"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <Flame className="h-4 w-4 text-accent" strokeWidth={2.4} />
            {!isJoined
              ? "Přidej se a bojuj o týdenní žebříček"
              : weekly.weekMatchCount === 0
                ? "Tenhle týden se zatím nehraje"
                : ownWeeklyRank
                  ? `Tenhle týden: ${ownWeeklyPoints} b. · ${ownWeeklyRank.rank}. místo z ${ownWeeklyRank.total}`
                  : "Tenhle týden zatím bez bodů — natipuj si a naskoč do žebříčku"}
          </span>
          <span className="shrink-0 text-xs font-bold text-accent">
            Žebříček →
          </span>
        </Link>
      )}

      {!matches?.length && (
        <p className="text-sm text-muted-foreground">
          Zatím tu nejsou žádné zápasy.
        </p>
      )}

      {(() => {
        const upcomingMissing: Match[] = [];
        const upcomingPredicted: Match[] = [];
        const live: Match[] = [];
        const postponed: Match[] = [];
        const past: Match[] = [];
        for (const match of matches ?? []) {
          const isLocked =
            match.status !== "scheduled" ||
            new Date(match.kickoff_at) <= new Date();
          if (match.status === "postponed") {
            // Vlastní sekce, ne "Probíhající" -- livesport.cz odložený
            // zápas vynechá jak z rozpisu, tak z výsledků, dokud
            // nevyhlásí nový termín (viz results.mjs), takže appka o
            // něm neví o nic víc než "zatím se neděje" -- na rozdíl od
            // "Probíhající" tam proto nemá smysl čekat na skóre.
            //
            // Zobrazuje se ale JEN v den, kdy se měl původně hrát
            // (6.9.2026, na žádost uživatele) -- appka bez nového
            // termínu status nemá jak sama posunout (viz komentář
            // výše), takže by bez týhle podmínky zápas zůstal v
            // "Odloženo" navždy, dokud livesport.cz nevyhlásí nový
            // termín. Zpráva "je odložen" je užitečná ten den, kdy by
            // se hráč jinak divil, proč zápas nezačal -- později už je
            // to jen šum.
            if (isSameCalendarDayInPrague(new Date(match.kickoff_at), new Date())) {
              postponed.push(match);
            }
          } else if (match.status === "finished") {
            past.push(match);
          } else if (isLocked) {
            // Buď appka výslovně ví, že zápas právě běží
            // (status === "live", viz sync-results.mjs), nebo jen uplynul
            // výkop a ještě nemáme čerstvá data (sync běží jednou za
            // 30 minut) -- v obou případech patří do "Probíhající", ne
            // do "Proběhlé" (tam by bez skóre a bez tipu ostatních
            // vypadal jako chyba).
            live.push(match);
          } else if (new Date(match.kickoff_at) > new Date(upcomingWindowEnd)) {
            // Zápas je dál než zobrazované okno (UPCOMING_WINDOW_DAYS
            // výše) -- appka ho zatím neukazuje, i kdyby ho už měla
            // načtený ze staršího (delšího) synchronizačního okna.
            continue;
          } else if (ownPredictionByMatch.has(match.id)) {
            upcomingPredicted.push(match);
          } else {
            upcomingMissing.push(match);
          }
        }
        // Nejbližší zápas nahoře ve všech sekcích: nadcházející a
        // probíhající vzestupně (jak přišly z DB), proběhlé sestupně
        // (nejnovější výsledek první). Ořezáno na PAST_MAX_COUNT --
        // nejstarší zápasy nad tenhle strop appka vůbec nezobrazí (viz
        // komentář u konstanty).
        past.reverse();
        const pastVisible = past.slice(0, PAST_MAX_COUNT);

        // "Vysvícený" nejbližší zápas (odsouhlaseno s uživatelem
        // 29.8.2026, viz vizuální návrh): vždy chronologicky nejbližší
        // netipovaný zápas, zvýrazněný jako velká karta nahoře -- po
        // zadání tipu se sám přesune do "Už tipnuto" a vysvítí se
        // další, protože je to prostě první položka už seřazeného
        // seznamu "Ještě netipováno". Při shodě přesného času výkopu
        // (víc zápasů začíná úplně stejně) se vybírá náhodně -- appka
        // je server-rendered, náhoda se tedy spočítá jednou na serveru
        // při načtení stránky, ne opakovaně v prohlížeči.
        let spotlight: Match | null = null;
        let restMissing = upcomingMissing;
        if (upcomingMissing.length > 0) {
          const earliestKickoff = upcomingMissing[0].kickoff_at;
          const candidates = upcomingMissing.filter(
            (m) => m.kickoff_at === earliestKickoff,
          );
          spotlight = candidates[Math.floor(Math.random() * candidates.length)];
          restMissing = upcomingMissing.filter((m) => m.id !== spotlight!.id);
        }

        const hasUpcoming = upcomingMissing.length > 0 || upcomingPredicted.length > 0;
        // "Nic k tipování" hláška (6.9.2026, na žádost uživatele) --
        // dřív byla celá sekce (i hláška "vše natipováno") schovaná za
        // `hasUpcoming`, takže když appka v okně neměla vůbec žádný
        // zápas (ani netipovaný, ani tipnutý -- typicky reprezentační
        // pauza nebo mimosezóna), celá sekce zmizela beze slova. Teď se
        // sekce zobrazí i v tom případě, aby přihlášený hráč vždycky
        // dostal jasnou odpověď, ne ticho.
        const showCaughtUpMessage = isJoined && upcomingMissing.length === 0;

        return (
          <>
            {/* Skončená hecovačka (isArchived) nemá "Nadcházející" vůbec
             * -- appka v ní žádný další zápas nikdy nevybere (viz
             * hecovacky.mjs, archivace se dělá právě proto), takže sekce
             * by věčně visela na "vše natipováno" i po konci soutěže
             * (uživatel 21.9.2026 nahlásil přesně tohle). */}
            {!isArchived && (hasUpcoming || showCaughtUpMessage) && (
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold text-muted-foreground">
                  Nadcházející ({upcomingMissing.length + upcomingPredicted.length})
                </h2>

                {spotlight ? (
                  <>
                    <SpotlightMatchCard
                      match={spotlight}
                      isJoined={isJoined}
                      sport={competitionFallbackSport(competition.sport)}
                      competitionId={competition.id}
                      logos={matchLogos.get(spotlight.id) ?? {}}
                      isSharedMatch={sharedMatchIds.has(spotlight.id)}
                    />
                    {restMissing.length > 0 && (
                      <ExpandableList
                        initialCount={UPCOMING_MISSING_EXTRA_VISIBLE_COUNT}
                        carouselItems={restMissing.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isLocked={false}
                            isJoined={isJoined}
                            existing={null}
                            sport={competitionFallbackSport(competition.sport)}
                            competitionId={competition.id}
                            matchLogos={matchLogos}
                            sharedMatchIds={sharedMatchIds}
                            othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                            layout="carousel"
                          />
                        ))}
                        stackItems={restMissing.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isLocked={false}
                            isJoined={isJoined}
                            existing={null}
                            sport={competitionFallbackSport(competition.sport)}
                            competitionId={competition.id}
                            matchLogos={matchLogos}
                            sharedMatchIds={sharedMatchIds}
                            othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                            layout="stack"
                          />
                        ))}
                      />
                    )}
                  </>
                ) : (
                  showCaughtUpMessage && (
                    <p className="text-sm font-medium text-muted-foreground">
                      {upcomingPredicted.length > 0
                        ? "✅ Máš vyplněné tipy na všechny nadcházející zápasy."
                        : `✅ Není nic k tipování — v příštích ${UPCOMING_WINDOW_DAYS} dnech se nehraje žádný zápas.`}
                    </p>
                  )
                )}

                {upcomingPredicted.length > 0 && (
                  <div className="mt-1 flex flex-col gap-3">
                    <h3 className="text-xs font-bold text-faint-foreground">
                      Už tipnuto ({upcomingPredicted.length})
                    </h3>
                    <ExpandableList
                      initialCount={UPCOMING_PREDICTED_VISIBLE_COUNT}
                      carouselItems={upcomingPredicted.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          isLocked={false}
                          isJoined={isJoined}
                          existing={ownPredictionByMatch.get(match.id) ?? null}
                          sport={competitionFallbackSport(competition.sport)}
                          competitionId={competition.id}
                          matchLogos={matchLogos}
                          sharedMatchIds={sharedMatchIds}
                          othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                          layout="carousel"
                        />
                      ))}
                      stackItems={upcomingPredicted.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          isLocked={false}
                          isJoined={isJoined}
                          existing={ownPredictionByMatch.get(match.id) ?? null}
                          sport={competitionFallbackSport(competition.sport)}
                          competitionId={competition.id}
                          matchLogos={matchLogos}
                          sharedMatchIds={sharedMatchIds}
                          othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                          layout="stack"
                        />
                      ))}
                    />
                  </div>
                )}
              </section>
            )}

            {live.length > 0 && (
              <section className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-danger">
                  <Radio className="h-4 w-4" strokeWidth={2.4} />
                  Probíhající
                </h2>
                <ul className={MATCH_GRID_CLASSNAME}>
                  {live.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competitionFallbackSport(competition.sport)}
                      competitionId={competition.id}
                      matchLogos={matchLogos}
                      sharedMatchIds={sharedMatchIds}
                      othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                    />
                  ))}
                </ul>
              </section>
            )}

            {postponed.length > 0 && (
              <section className="flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/[0.06] p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-warning">
                  <CalendarOff className="h-4 w-4" strokeWidth={2.4} />
                  Odloženo
                </h2>
                <ul className={MATCH_GRID_CLASSNAME}>
                  {postponed.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competitionFallbackSport(competition.sport)}
                      competitionId={competition.id}
                      matchLogos={matchLogos}
                      sharedMatchIds={sharedMatchIds}
                      othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                    />
                  ))}
                </ul>
              </section>
            )}

            {pastVisible.length > 0 && (
              <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-hover p-4">
                <h2 className="text-sm font-bold text-muted-foreground">
                  Proběhlé
                </h2>
                <ExpandableList
                  initialCount={PAST_VISIBLE_COUNT}
                  carouselItems={pastVisible.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competitionFallbackSport(competition.sport)}
                      competitionId={competition.id}
                      matchLogos={matchLogos}
                      sharedMatchIds={sharedMatchIds}
                      othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                      layout="carousel"
                    />
                  ))}
                  stackItems={pastVisible.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competitionFallbackSport(competition.sport)}
                      competitionId={competition.id}
                      matchLogos={matchLogos}
                      sharedMatchIds={sharedMatchIds}
                      othersPredictions={othersPredictionsByMatch.get(match.id) ?? []}
                      layout="stack"
                    />
                  ))}
                />
              </section>
            )}
          </>
        );
      })()}

      {isJoined && (
        <form
          action={leaveCompetition.bind(null, competition.id)}
          className="mt-4 self-start"
        >
          <button
            type="submit"
            className="btn-press rounded-full border border-danger/30 bg-danger/5 px-4 py-2 text-xs font-bold text-danger hover:bg-danger/10"
          >
            Opustit soutěž
          </button>
        </form>
      )}
    </main>
  );
}

type Prediction = {
  predicted_home_score: number;
  predicted_away_score: number;
  predicted_overtime_flag: boolean | null;
  points: number | null;
} | null;

// Krok 8 (odsouhlaseno 28.8.2026), přebarveno 6.9.2026 na žádost
// uživatele: barva kartičky ukazuje úspěšnost VLASTNÍHO tipu, ne
// výsledek zápasu -- ale místo tří různých barev (zelená/žlutá/šedá,
// kde žlutá matoucně evokovala chybu/varování) appka teď stupňuje
// SYTOST jedné barvy (sportovní --accent appky, viz sportAccentStyle()
// v src/lib/sport.ts -- zelená pro fotbal, modrá pro hokej): čím víc
// appka trefila, tím tmavší odstín. "one" (trefen jen výherce/remíza
// NEBO jen součet gólů) je nejsvětlejší, "both" (obojí, ale ne přesné
// skóre) tmavší, "exact" (přesné skóre) nejtmavší. Stejná pravidla
// jako `calculate_match_points()`
// (supabase/migrations/20260825100000_scoring_trigger.sql), jen bez
// závislosti na bodové hodnotě (ta je per-competition nastavitelná --
// u výchozího bodování 3/1/1 tak "one" odpovídá 1 bodu, "both" 2
// bodům a "exact" 3 bodům, ale appka na tom přímo nezávisí).
function getResultTone(
  match: Match,
  existing: Prediction,
): "exact" | "both" | "one" | "miss" | null {
  if (
    match.status !== "finished" ||
    match.home_score === null ||
    match.away_score === null ||
    !existing
  ) {
    return null;
  }

  if (
    existing.predicted_home_score === match.home_score &&
    existing.predicted_away_score === match.away_score
  ) {
    return "exact";
  }

  const actualOutcome =
    match.home_score > match.away_score
      ? "home"
      : match.away_score > match.home_score
        ? "away"
        : "draw";
  const predictedOutcome =
    existing.predicted_home_score > existing.predicted_away_score
      ? "home"
      : existing.predicted_away_score > existing.predicted_home_score
        ? "away"
        : "draw";

  const winnerMatches = predictedOutcome === actualOutcome;
  const goalsMatch =
    existing.predicted_home_score + existing.predicted_away_score ===
    match.home_score + match.away_score;

  if (winnerMatches && goalsMatch) return "both";
  if (winnerMatches || goalsMatch) return "one";
  return "miss";
}

const RESULT_TONE_CLASSES = {
  exact: "border-accent/60 bg-accent/[0.22]",
  both: "border-accent/40 bg-accent/[0.14]",
  one: "border-accent/25 bg-accent/[0.07]",
  miss: "border-border-subtle bg-surface",
} as const;

function MatchCard({
  match,
  isLocked,
  isJoined,
  existing,
  sport,
  competitionId,
  matchLogos,
  sharedMatchIds,
  othersPredictions,
  layout = "carousel",
}: {
  match: Match;
  isLocked: boolean;
  isJoined: boolean;
  existing: Prediction;
  sport: "hockey" | "football";
  competitionId: string;
  matchLogos: Map<string, MatchLogos>;
  sharedMatchIds: Set<string>;
  /** Tipy ostatních hráčů na TENHLE zápas -- appka je vypisuje jen u
   * probíhajícího/proběhlého zápasu (viz `isLocked` větev níže), pro
   * ostatní stavy appka pole prostě nevyužije (RLS ho beztak vrátí
   * prázdné, viz komentář u `othersPredictionsByMatch` výše). */
  othersPredictions: {
    userId: string;
    displayName: string;
    homeScore: number;
    awayScore: number;
    overtimeFlag: boolean;
  }[];
  /** "carousel" (výchozí) = kartička má na mobilu fixní procentuální
   * šířku (peek dalšího zápasu při swipu), "stack" = plná šířka řádku
   * (appka na to přepne po kliknutí na "Zobrazit všechny", viz
   * ExpandableList). Sekce bez tlačítka ("Probíhající", "Odloženo")
   * layout vůbec nepředávají, zůstávají na výchozím "carousel". */
  layout?: "carousel" | "stack";
}) {
  // U "Náhodné ligy" (competition.sport === "mixed") nese vlastní sport
  // každý zápas zvlášť -- jinak je match.sport null a bere se sport
  // předaný z competition, jak appka dělala vždycky.
  const effectiveSport = match.sport ?? sport;
  const tone = getResultTone(match, existing);
  const cardToneClass =
    match.status === "postponed"
      ? "border-warning/40 bg-warning/10"
      : tone
        ? RESULT_TONE_CLASSES[tone]
        : "border-border-subtle bg-surface";

  const pointsToneClass =
    tone === "exact" || tone === "both" || tone === "one"
      ? "text-accent"
      : "text-muted-foreground";

  // Odehrané zápasy vypadaly skoro stejně jako ty, co se ještě
  // tipují -- uživatel nahlásil 12.9.2026, že je appka málo odlišuje.
  // Odsouhlaseno: tlumenější/šedivější kartička (desaturace přes
  // Tailwind filter utility) pro VŠECHNY dohrané zápasy bez ohledu na
  // úspěšnost tipu -- relativní barevné odlišení podle přesnosti tipu
  // (RESULT_TONE_CLASSES, sytost zelené) zůstává zachované, jen celá
  // kartička působí klidněji než živá "Nadcházející"/"Probíhající".
  const finishedMutedClass = match.status === "finished" ? "saturate-[0.55]" : "";

  const layoutClass =
    layout === "carousel"
      ? "w-[85%] shrink-0 snap-start sm:w-auto sm:shrink"
      : "";

  return (
    <li
      style={sportAccentStyle(effectiveSport)}
      className={`rounded-[18px] border p-4 ${layoutClass} ${cardToneClass} ${finishedMutedClass}`}
    >
      <Link
        href={`/spaces/${competitionId}/matches/${match.id}`}
        className="btn-press -mx-2 -my-1 flex flex-col gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-surface-hover"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-faint-foreground">
            {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Prague",
            })}
            {!isLocked && (
              <>
                {" · "}
                <span className="font-bold text-accent">
                  {formatRelativeKickoff(match.kickoff_at)}
                </span>
              </>
            )}
          </span>
          {isLocked
            ? existing?.points !== null &&
              existing?.points !== undefined &&
              (tone === "exact" ? (
                <ExactScoreCelebration matchId={match.id} points={existing.points} />
              ) : (
                <span
                  className={`text-lg font-extrabold leading-none ${pointsToneClass}`}
                >
                  {existing.points} b.
                </span>
              ))
            : existing ? (
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
                  Tipnuto
                </span>
              ) : (
                <Circle className="h-[18px] w-[18px] text-border-strong" strokeWidth={2.2} />
              )}
        </div>

        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <TeamBadge url={matchLogos.get(match.id)?.home} name={match.home_team} />
            <span className="max-w-[88px] truncate text-center text-xs font-bold">
              {match.home_team}
            </span>
          </div>
          <span
            className={`shrink-0 text-sm font-extrabold ${
              match.status === "live" ? "text-danger" : "text-muted-foreground"
            }`}
          >
            {isLocked && match.home_score !== null && match.away_score !== null
              ? `${match.home_score}:${match.away_score}${match.overtime_flag ? " (PP)" : ""}`
              : "–"}
          </span>
          <div className="flex min-w-0 flex-col items-center gap-1.5">
            <TeamBadge url={matchLogos.get(match.id)?.away} name={match.away_team} />
            <span className="max-w-[88px] truncate text-center text-xs font-bold">
              {match.away_team}
            </span>
          </div>
        </div>
      </Link>

      {isLocked ? (
        <div className="mt-2 text-xs font-semibold text-faint-foreground">
          {match.status === "live" && match.home_score === null && match.away_score === null && (
            <p className="font-bold text-danger">Právě se hraje</p>
          )}
          {match.status === "scheduled" && new Date(match.kickoff_at) <= new Date() && (
            <p className="font-bold text-danger">
              Zápas právě začal, čekáme na aktuální skóre
            </p>
          )}
          {match.status === "postponed" && (
            <p className="font-bold text-warning">
              Zápas je odložen, nový termín zatím není znám
            </p>
          )}
          {existing ? (
            <p className="text-base font-extrabold text-foreground">
              Tvůj tip: {existing.predicted_home_score}:{existing.predicted_away_score}
              {existing.predicted_overtime_flag && (
                <span className="ml-1 text-xs font-bold text-muted-foreground">(PP)</span>
              )}
            </p>
          ) : match.status === "postponed" ? (
            <p>Zatím jste nestihl(a) zadat tip -- půjde znovu, jakmile appka zachytí nový termín.</p>
          ) : (
            <p>Nestihl(a) jste tip, zápas je zamčený.</p>
          )}

          {/* Tipy ostatních hráčů (18.9.2026, na žádost uživatele) --
           * jen u probíhajícího/proběhlého zápasu, menším písmem než
           * "Tvůj tip" výše. Mezera mezi jménem a skóre (i před "(PP)")
           * je NEZALOMITELNÁ ( ) -- uživatel 19.9.2026 nahlásil, že
           * se při zalomení řádku jméno a jeho tip roztrhly na dva
           * řádky, což vypadalo zmateně. Oddělovač MEZI hráči (" · ")
           * zůstává obyčejná mezera -- tam se zalomit smí a má. */}
          {(match.status === "live" || match.status === "finished") &&
            othersPredictions.length > 0 && (
              <p className="mt-1.5 text-[11px] font-medium leading-snug text-faint-foreground">
                {othersPredictions
                  .map(
                    (p) =>
                      `${p.displayName} ${p.homeScore}:${p.awayScore}${p.overtimeFlag ? " (PP)" : ""}`,
                  )
                  .join(" · ")}
              </p>
            )}
        </div>
      ) : isJoined ? (
        <PredictionForm
          sport={effectiveSport}
          competitionId={competitionId}
          matchId={match.id}
          existing={existing}
          isSharedMatch={sharedMatchIds.has(match.id)}
        />
      ) : (
        <p className="mt-2 text-xs font-semibold text-faint-foreground">
          Nejdřív se do soutěže musíte přihlásit tlačítkem „Chci hrát“
          nahoře.
        </p>
      )}
    </li>
  );
}
