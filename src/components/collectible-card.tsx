import { Beer, Crown, Sparkles, Trophy } from "lucide-react";
import styles from "./collectible-card.module.css";

export type CollectibleCardRarity = "basic" | "rare" | "legendary";

type CollectibleCardProps = {
  rarity: CollectibleCardRarity;
  title: string;
  description: string;
  week: string;
  wins: number;
  competitions: string[];
  seriesNumber: string;
  artworkUrl?: string;
};

const rarityMeta = {
  basic: {
    label: "ZÁKLADNÍ",
    collectorLabel: "BASE",
    Icon: Beer,
  },
  rare: {
    label: "VZÁCNÁ",
    collectorLabel: "RARE",
    Icon: Sparkles,
  },
  legendary: {
    label: "LEGENDÁRNÍ",
    collectorLabel: "LEGEND",
    Icon: Crown,
  },
} satisfies Record<
  CollectibleCardRarity,
  { label: string; collectorLabel: string; Icon: typeof Beer }
>;

export function CollectibleCard({
  rarity,
  title,
  description,
  week,
  wins,
  competitions,
  seriesNumber,
  artworkUrl,
}: CollectibleCardProps) {
  const meta = rarityMeta[rarity];
  const Icon = meta.Icon;
  const artworkStyle = artworkUrl
    ? {
        backgroundImage: `linear-gradient(180deg, transparent 48%, rgba(8, 10, 14, 0.78) 100%), url(${JSON.stringify(artworkUrl)})`,
      }
    : undefined;

  return (
    <article
      className={`${styles.card} ${styles[rarity]}`}
      aria-label={`${meta.label} sběratelská karta: ${title}`}
    >
      <div className={styles.frame}>
        <div className={styles.body}>
          <div className={styles.texture} aria-hidden="true" />
          <div className={styles.foil} aria-hidden="true" />

          <header className="relative z-10 flex items-start justify-between gap-3 px-4 pt-4">
            <div>
              <p className={styles.kicker}>KLOPI WEEKLY · {week}</p>
              <p className="mt-0.5 text-[10px] font-black tracking-[0.2em] opacity-55">
                COLLECTOR SERIES
              </p>
            </div>
            <div className={styles.rarityChip}>
              <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
              <span>{meta.collectorLabel}</span>
            </div>
          </header>

          <div
            className={`${styles.artwork} ${artworkUrl ? styles.artworkWithImage : ""}`}
            style={artworkStyle}
          >
            {!artworkUrl && (
              <div className={styles.artworkPlaceholder}>
                <div className={styles.artworkHalo} aria-hidden="true" />
                <Trophy className="relative h-20 w-20 opacity-80" strokeWidth={1.25} />
                <span className="relative mt-3 text-[10px] font-black tracking-[0.28em] opacity-60">
                  YOUR ARTWORK
                </span>
              </div>
            )}

            <div className={styles.artworkStamp}>
              <span>{meta.label}</span>
            </div>
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className={styles.title}>{title}</p>
                <p className={styles.description}>{description}</p>
              </div>
              <div className={styles.winStat}>
                <strong>{wins}×</strong>
                <span>VÝHRA</span>
              </div>
            </div>

            <div className={styles.rule} />

            <div className="mt-auto flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-45">
                  Vyhráno v
                </p>
                <p className="mt-1 truncate text-[10px] font-extrabold opacity-80">
                  {competitions.join(" · ")}
                </p>
              </div>
              <p className="shrink-0 text-[9px] font-black tracking-[0.14em] opacity-45">
                #{seriesNumber}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
