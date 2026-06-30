/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createUserScopedClient, parseJson, requireUser } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const clientResult = createUserScopedClient(req);
  if ("error" in clientResult) return clientResult.error;

  const userResult = await requireUser(clientResult.supabase);
  if ("error" in userResult) return userResult.error;

  const bodyResult = await parseJson(req);
  if ("error" in bodyResult) return bodyResult.error;

  const body = bodyResult.data ?? {};
  const { data, error } = await clientResult.supabase.rpc("manual_adjust_score", {
    p_season_id: body.seasonId,
    p_player_id: body.playerId ?? body.userId,
    p_points_delta: body.pointsDelta,
    p_reason: body.reason,
  });

  if (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  const { data: entryRow } = await clientResult.supabase
    .from("manual_score_adjustments")
    .select("metadata")
    .eq("id", data)
    .maybeSingle();

  const metadata = entryRow?.metadata && typeof entryRow.metadata === "object"
    ? entryRow.metadata as Record<string, unknown>
    : {};

  return jsonResponse({
    ledgerEntryId: data,
    adjustedBy: userResult.user.id,
    anchorMatchDate: typeof metadata.anchor_match_date === "string" ? metadata.anchor_match_date : null,
    anchorMatchNo: typeof metadata.anchor_match_no === "number" ? metadata.anchor_match_no : null,
  });
});
