import { supabase } from "./supabase";
import { ReferralStats } from "../types";

export async function fetchReferralStats(): Promise<ReferralStats> {
  const { data, error } = await supabase.rpc("get_my_referral_stats");
  if (error) throw error;
  return data as ReferralStats;
}
