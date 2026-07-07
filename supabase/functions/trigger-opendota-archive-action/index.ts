/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createUserScopedClient,
  parseJson,
  requireUser,
  requiredEnv,
} from "../_shared/client.ts";

type TriggerOpendotaArchiveBody = {
  archiveMonth?: string;
  month?: string;
  limit?: number | string;
  force?: boolean;
};

const DEFAULT_WORKFLOW_ID = "capture-opendota-screenshots.yml";
const DEFAULT_MONTH_LIMIT = 50;

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

function getGithubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json; charset=utf-8",
    "X-GitHub-Api-Version": "2022-11-28",
  };
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

  const repository = requiredEnv("GITHUB_REPOSITORY");
  const token = requiredEnv("GITHUB_TOKEN");
  const workflowId = optionalEnv("OPENDOTA_SCREENSHOT_WORKFLOW_ID") || DEFAULT_WORKFLOW_ID;
  const branch = optionalEnv("GITHUB_WORKFLOW_BRANCH")
    || optionalEnv("GITHUB_ARCHIVE_BRANCH")
    || "main";
  const limit = normalizeLimit(bodyResult.data?.limit);
  const force = Boolean(bodyResult.data?.force);
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
    return jsonResponse(
      {
        error: String(
          githubPayload?.message
            || `GitHub workflow dispatch failed with status ${githubResponse.status}.`,
        ),
      },
      { status: 502 },
    );
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
});
