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
  const { data, error } = await clientResult.supabase.rpc("submit_match", {
    p_season_id: body.seasonId,
    p_players: body.players,
    p_winner_side: body.winnerSide ?? null,
    p_match_date: body.matchDate ?? null,
    p_notes: body.notes ?? null,
    p_metadata: body.metadata ?? {},
  });

  if (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  return jsonResponse({
    matchId: data,
    submittedBy: userResult.user.id,
  });
});
