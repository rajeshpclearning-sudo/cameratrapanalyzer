import { NextResponse } from "next/server";
import { checkSupabaseConnection, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await checkSupabaseConnection();

  return NextResponse.json({
    ok: true,
    service: "camera-trap-analyzer",
    supabaseConfigured: isSupabaseConfigured(),
    supabase: {
      connected: supabase.ok,
      rowCount: supabase.rowCount,
      error: supabase.error,
      urlHost: supabase.urlHost,
      keyKind: supabase.keyKind,
    },
  });
}
