"use server";

import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type CreateHecovackaState = { error: string | null };

// Appka pár věcí validuje i sama v `create_hecovacka()` (viz
// supabase/migrations/20260915090200_hecovacky_functions_hardening.sql)
// jako záchrannou síť pro případ, že by appka někdy zavolala RPC bez
// stejné kontroly tady (nebo se validace tady rozjela) -- appka ale
// vrací tyhle chybové kódy syrové (`raise exception 'end_date_in_past'`
// se v Supabase klientovi objeví přesně jako `error.message ===
// "end_date_in_past"`), takže je potřeba je přeložit, ať uživatel
// nevidí anglický technický kód.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  name_required: "Zadej název hecovačky.",
  end_date_required: "Zadej datum, do kdy se hraje.",
  end_date_in_past: "Datum konce nemůže být v minulosti.",
  end_date_before_start_date: "Datum konce nemůže být dřív než datum začátku.",
  max_matches_per_day_invalid: "Denní limit zápasů musí být kladné celé číslo.",
  source_competitions_required:
    "Vyber aspoň jednu soutěž, ze které appka bude brát zápasy.",
};

function todayInPragueIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague" }).format(new Date());
}

export async function createHecovacka(
  _prevState: CreateHecovackaState,
  formData: FormData,
): Promise<CreateHecovackaState> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return { error: "Nejste přihlášen." };

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "").trim();
  const endDate = String(formData.get("end_date") ?? "").trim();
  const matchLimitMode = formData.get("match_limit_mode");
  const matchLimitValue = String(formData.get("max_matches_per_day") ?? "").trim();
  const sourceCompetitionIds = formData.getAll("source_competition_ids").map(String);
  const initialParticipantIds = formData.getAll("initial_participant_ids").map(String);

  if (!name) {
    return { error: "Zadej název hecovačky." };
  }
  if (!endDate) {
    return { error: "Zadej datum, do kdy se hraje." };
  }
  if (endDate < todayInPragueIsoDate()) {
    return { error: "Datum konce nemůže být v minulosti." };
  }
  if (startDate && endDate < startDate) {
    return { error: "Datum konce nemůže být dřív než datum začátku." };
  }
  if (sourceCompetitionIds.length === 0) {
    return { error: "Vyber aspoň jednu soutěž, ze které appka bude brát zápasy." };
  }

  let maxMatchesPerDay: number | null = null;
  if (matchLimitMode === "limited") {
    const parsed = Number(matchLimitValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: "Denní limit zápasů musí být kladné celé číslo." };
    }
    maxMatchesPerDay = parsed;
  }

  const { data: hecovackaId, error } = await supabase.rpc("create_hecovacka", {
    p_name: name,
    p_description: description || null,
    p_start_date: startDate || null,
    p_end_date: endDate,
    p_max_matches_per_day: maxMatchesPerDay,
    p_source_competition_ids: sourceCompetitionIds,
    p_initial_participant_ids: initialParticipantIds,
  });

  if (error || !hecovackaId) {
    const message = error?.message ? RPC_ERROR_MESSAGES[error.message] : undefined;
    return { error: message ?? "Založení hecovačky se nepodařilo." };
  }

  redirect(`/spaces/${hecovackaId}`);
}
