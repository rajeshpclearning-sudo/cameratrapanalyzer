import { NextResponse } from "next/server";
import { getLlmProviderHint, getModel } from "@/lib/llm/analyze";
import { checkSupabaseConnection, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await checkSupabaseConnection();
  const llm = getLlmProviderHint();

  return NextResponse.json({
    ok: true,
    service: "camera-trap-analyzer",
    llmModel: getModel(),
    llmApiKeyConfigured: llm.apiKeyConfigured,
    llmBaseUrlHost: llm.baseUrlHost,
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
