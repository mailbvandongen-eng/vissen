import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase niet geconfigureerd. Voeg SUPABASE_URL en SUPABASE_ANON_KEY toe aan backend/.env"
    );
  }
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

export async function uploadPhoto(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from("photos")
    .upload(filename, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("photos")
    .getPublicUrl(filename);

  return urlData.publicUrl;
}
