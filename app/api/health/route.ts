import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "camera-trap-analyzer",
    supabaseConfigured: isSupabaseConfigured(),
  });
}
