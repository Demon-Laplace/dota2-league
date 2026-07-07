/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireUser,
} from "../_shared/client.ts";

type RequestBody = {
  matchId?: string | null;
};

type MatchRow = {
  match_id: string;
  season_id: string;
  match_date?: string | null;
};

type AssetRow = {
  id: string;
  match_id: string;
  season_id: string;
  dota_match_id?: string | null;
  asset_status: string;
  storage_bucket: string;
  storage_path?: string | null;
  source_url?: string | null;
  captured_at?: string | null;
  requested_at?: string | null;
  last_requested_at?: string | null;
  request_count?: number | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeUuid(value: unknown) {
  const normalized = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : "";
}

function getOptionalEnv(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

async function dispatchScreenshotWorkflow(matchId: string) {
  const token = getOptionalEnv("GITHUB_SCREENSHOT_DISPATCH_TOKEN");
  if (!token) {
    return {
      dispatched: false,
      reason: "未配置 GITHUB_SCREENSHOT_DISPATCH_TOKEN，已等待定时 Action 处理。",
    };
  }

  const repository = getOptionalEnv("GITHUB_SCREENSHOT_REPOSITORY") || "Demon-Laplace/dota2-league";
  const workflow = getOptionalEnv("GITHUB_SCREENSHOT_WORKFLOW") || "capture-opendota-screenshots.yml";
  const ref = getOptionalEnv("GITHUB_SCREENSHOT_REF") || "main";
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref,
      inputs: {
        match_id: matchId,
        limit: "1",
        force: "false",
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      dispatched: false,
      reason: `GitHub Action 触发失败（HTTP ${response.status}）：${text || response.statusText}`,
    };
  }

  return { dispatched: true, reason: "" };
}

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

  const bodyResult = await parseJson<RequestBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const matchId = normalizeUuid(bodyResult.data?.matchId);
  if (!matchId) {
    return jsonResponse({ error: "比赛记录 ID 无效。" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: match, error: matchError } = await serviceClient
    .from("v_match_detail")
    .select("match_id, season_id, match_date")
    .eq("match_id", matchId)
    .maybeSingle();

  if (matchError) {
    return jsonResponse({ error: matchError.message }, { status: 400 });
  }

  const matchRow = match as MatchRow | null;
  if (!matchRow?.match_id || !matchRow.season_id) {
    return jsonResponse({ error: "未找到对应比赛记录。" }, { status: 404 });
  }

  const { data: canSubmit, error: accessError } = await clientResult.supabase.rpc("can_submit_matches", {
    p_season_id: matchRow.season_id,
  });

  if (accessError) {
    return jsonResponse({ error: accessError.message }, { status: 400 });
  }

  if (!canSubmit) {
    return jsonResponse({ error: "仅记分员或管理员可触发 OpenDota 截图生成。" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: existingAsset, error: existingError } = await serviceClient
    .from("official_match_assets")
    .select("id, match_id, season_id, dota_match_id, asset_status, storage_bucket, storage_path, source_url, captured_at, requested_at, last_requested_at, request_count, last_error, created_at, updated_at")
    .eq("match_id", matchRow.match_id)
    .eq("provider", "opendota")
    .eq("asset_kind", "overview_screenshot")
    .maybeSingle();

  if (existingError) {
    return jsonResponse({ error: existingError.message }, { status: 400 });
  }

  const existingAssetRow = existingAsset as AssetRow | null;
  if (existingAssetRow?.storage_path && existingAssetRow.asset_status === "available") {
    return jsonResponse({
      asset: existingAssetRow,
      dispatched: false,
      message: "截图已存在。",
    });
  }

  const requestPayload = {
    match_id: matchRow.match_id,
    season_id: matchRow.season_id,
    provider: "opendota",
    asset_kind: "overview_screenshot",
    asset_status: existingAssetRow?.dota_match_id ? "pending" : "requested",
    dota_match_id: existingAssetRow?.dota_match_id ?? null,
    storage_bucket: "opendota-match-screenshots",
    source_url: existingAssetRow?.source_url ?? null,
    requested_at: existingAssetRow?.requested_at ?? now,
    last_requested_at: now,
    request_count: Number(existingAssetRow?.request_count ?? 0) + 1,
    last_error: null,
    created_by: userResult.user.id,
  };

  const { data: asset, error: upsertError } = await serviceClient
    .from("official_match_assets")
    .upsert(requestPayload, { onConflict: "match_id,provider,asset_kind" })
    .select("id, match_id, season_id, dota_match_id, asset_status, storage_bucket, storage_path, source_url, captured_at, requested_at, last_requested_at, request_count, last_error, created_at, updated_at")
    .single();

  if (upsertError) {
    return jsonResponse({ error: upsertError.message }, { status: 400 });
  }

  const dispatchResult = await dispatchScreenshotWorkflow(matchRow.match_id);
  return jsonResponse({
    asset: asset as AssetRow,
    dispatched: dispatchResult.dispatched,
    message: dispatchResult.dispatched
      ? "已提交 OpenDota 截图生成任务。"
      : dispatchResult.reason,
  });
});
