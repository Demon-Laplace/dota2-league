/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireUser,
} from "../_shared/client.ts";

type TriggerOpendotaArchiveBody = {
  archiveMonth?: string;
  month?: string;
  limit?: number | string;
  force?: boolean;
  refreshExisting?: boolean;
};

const DEFAULT_WORKFLOW_ID = "capture-opendota-screenshots.yml";
const DEFAULT_REPOSITORY = "Demon-Laplace/dota2-league";
const DEFAULT_MONTH_LIMIT = 50;
const PROVIDER = "opendota";
const ASSET_KIND = "overview_screenshot";
const STORAGE_BUCKET = "opendota-match-screenshots";

function optionalEnv(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function normalizeArchiveMonth(value: unknown) {
  const normalized = String(value || "").trim();
  return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(normalized) ? normalized : "";
}

function normalizeLimit(value: unknown, fallback = DEFAULT_MONTH_LIMIT) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 50);
}

function getNextMonthCode(monthCode: string) {
  const [yearText, monthText] = monthCode.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return "";
  const nextMonth = new Date(Date.UTC(year, month, 1));
  return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getGithubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json; charset=utf-8",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function getGithubDispatchConfig() {
  const repository = optionalEnv("GITHUB_SCREENSHOT_REPOSITORY")
    || optionalEnv("GITHUB_REPOSITORY")
    || DEFAULT_REPOSITORY;
  const token = optionalEnv("GITHUB_SCREENSHOT_DISPATCH_TOKEN")
    || optionalEnv("GITHUB_TOKEN");
  const workflowId = optionalEnv("OPENDOTA_SCREENSHOT_WORKFLOW_ID")
    || optionalEnv("GITHUB_SCREENSHOT_WORKFLOW")
    || DEFAULT_WORKFLOW_ID;
  const branch = optionalEnv("GITHUB_SCREENSHOT_REF")
    || optionalEnv("GITHUB_WORKFLOW_BRANCH")
    || optionalEnv("GITHUB_ARCHIVE_BRANCH")
    || "main";

  if (!token) {
    return null;
  }

  return { repository, token, workflowId, branch };
}

async function queueMonthRefresh(archiveMonth: string, limit: number, createdBy: string) {
  const nextMonth = getNextMonthCode(archiveMonth);
  if (!nextMonth) {
    throw new Error("archiveMonth must use YYYY-MM format.");
  }

  const serviceClient = createServiceRoleClient();
  const { data: matches, error: matchesError } = await serviceClient
    .from("v_match_detail")
    .select("match_id, season_id, match_date, match_no")
    .gte("match_date", `${archiveMonth}-01`)
    .lt("match_date", `${nextMonth}-01`)
    .order("match_date", { ascending: true })
    .order("match_no", { ascending: true });

  if (matchesError) {
    throw new Error(matchesError.message);
  }

  const matchRows = Array.isArray(matches) ? matches : [];
  const matchIds = matchRows.map((match) => match.match_id).filter(Boolean);
  if (!matchIds.length) {
    return { queuedCount: 0 };
  }

  const { data: assets, error: assetsError } = await serviceClient
    .from("official_match_assets")
    .select("match_id, season_id, dota_match_id, asset_status, storage_path, source_url, requested_at, request_count")
    .in("match_id", matchIds)
    .eq("provider", PROVIDER)
    .eq("asset_kind", ASSET_KIND);

  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const assetByMatchId = new Map(
    (Array.isArray(assets) ? assets : [])
      .filter((asset) => asset?.dota_match_id || asset?.storage_path)
      .map((asset) => [asset.match_id, asset])
  );
  const now = new Date().toISOString();
  const payload = matchRows
    .map((match) => {
      const asset = assetByMatchId.get(match.match_id);
      if (!asset) return null;
      return {
        match_id: match.match_id,
        season_id: match.season_id,
        provider: PROVIDER,
        asset_kind: ASSET_KIND,
        asset_status: asset.dota_match_id ? "pending" : "requested",
        dota_match_id: asset.dota_match_id ?? null,
        storage_bucket: STORAGE_BUCKET,
        storage_path: asset.storage_path ?? null,
        source_url: asset.source_url ?? null,
        requested_at: asset.requested_at ?? now,
        last_requested_at: now,
        request_count: Number(asset.request_count ?? 0) + 1,
        last_error: null,
        created_by: createdBy,
      };
    })
    .filter(Boolean)
    .slice(0, limit);

  if (!payload.length) {
    return { queuedCount: 0 };
  }

  const { error: upsertError } = await serviceClient
    .from("official_match_assets")
    .upsert(payload, { onConflict: "match_id,provider,asset_kind" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return { queuedCount: payload.length };
}

async function handleTriggerRequest(req: Request) {
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

  const permissionResult = await clientResult.supabase.rpc("is_admin");
  if (permissionResult.error) {
    return jsonResponse({ error: permissionResult.error.message }, { status: 400 });
  }
  if (!permissionResult.data) {
    return jsonResponse({ error: "Forbidden." }, { status: 403 });
  }

  const bodyResult = await parseJson<TriggerOpendotaArchiveBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const archiveMonth = normalizeArchiveMonth(
    bodyResult.data?.archiveMonth ?? bodyResult.data?.month,
  );
  if (!archiveMonth) {
    return jsonResponse({ error: "archiveMonth must use YYYY-MM format." }, { status: 400 });
  }

  const limit = normalizeLimit(bodyResult.data?.limit);
  const force = Boolean(bodyResult.data?.force || bodyResult.data?.refreshExisting);
  const dispatchConfig = getGithubDispatchConfig();
  if (!dispatchConfig) {
    const queueResult = await queueMonthRefresh(archiveMonth, limit, userResult.user.id);
    return jsonResponse({
      triggered: false,
      queued: true,
      dispatchAvailable: false,
      archiveMonth,
      limit,
      force,
      ...queueResult,
      message: queueResult.queuedCount
        ? "已加入待处理队列；当前缺少 GITHUB_SCREENSHOT_DISPATCH_TOKEN，无法立即触发 GitHub Action。配置后请由管理员再次手动触发。"
        : "当前缺少 GITHUB_SCREENSHOT_DISPATCH_TOKEN，且该月份暂无可强制刷新的已有比赛详情。",
    });
  }

  const { repository, token, workflowId, branch } = dispatchConfig;
  const encodedWorkflowId = workflowId.split("/").map(encodeURIComponent).join("/");
  const dispatchUrl = `https://api.github.com/repos/${repository}/actions/workflows/${encodedWorkflowId}/dispatches`;

  const githubResponse = await fetch(dispatchUrl, {
    method: "POST",
    headers: getGithubHeaders(token),
    body: JSON.stringify({
      ref: branch,
      inputs: {
        archive_month: archiveMonth,
        archive_only: "false",
        limit: String(limit),
        force: force ? "true" : "false",
      },
    }),
  });

  if (!githubResponse.ok) {
    const githubPayload = await githubResponse.json().catch(() => null);
    const dispatchError = String(
      githubPayload?.message
        || `GitHub workflow dispatch failed with status ${githubResponse.status}.`,
    );
    const queueResult = await queueMonthRefresh(archiveMonth, limit, userResult.user.id);
    return jsonResponse({
      triggered: false,
      queued: true,
      dispatchAvailable: true,
      dispatchError,
      archiveMonth,
      limit,
      force,
      repository,
      branch,
      workflowId,
      ...queueResult,
      message: queueResult.queuedCount
        ? `已加入待处理队列；立即触发 GitHub Action 失败：${dispatchError}`
        : `立即触发 GitHub Action 失败：${dispatchError}`,
      actionsUrl: `https://github.com/${repository}/actions/workflows/${workflowId}`,
    });
  }

  return jsonResponse({
    triggered: true,
    archiveMonth,
    limit,
    force,
    repository,
    branch,
    workflowId,
    actionsUrl: `https://github.com/${repository}/actions/workflows/${workflowId}`,
  });
}

Deno.serve(async (req: Request) => {
  try {
    return await handleTriggerRequest(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message || "比赛记录同步触发失败。" }, { status: 500 });
  }
});
