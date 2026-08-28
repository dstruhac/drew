"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type UpdateNicknameState = { error: string | null; success: boolean };

export async function updateNickname(
  _prevState: UpdateNicknameState,
  formData: FormData,
): Promise<UpdateNicknameState> {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    return { error: "Nejste přihlášen.", success: false };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!displayName) {
    return { error: "Přezdívka nemůže být prázdná.", success: false };
  }
  if (displayName.length > 50) {
    return { error: "Přezdívka může mít nejvýš 50 znaků.", success: false };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);

  if (error) {
    return { error: error.message, success: false };
  }

  revalidatePath("/profil");
  revalidatePath("/spaces");
  return { error: null, success: true };
}
