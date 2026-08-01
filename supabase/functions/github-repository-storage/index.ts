/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createUserScopedClient,
  requireUser,
  requiredEnv,
} from "../_shared/client.ts";

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_GITHUB_REPOSITORY = "Demon-Laplace/dota2-league";

type RepositoryStorageResult = {
  repository: string;
  sizeBytes: number;
  checkedAt: string;
};

let cachedResult: RepositoryStorageResult | null = null;
let cachedAt = 0;

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

  const permissionResult = await clientResult.supabase.rpc("is_scorer");
  if (permissionResult.error) {
    return jsonResponse({ error: permissionResult.error.message }, { status: 500 });
  }
  if (!permissionResult.data) {
    return jsonResponse({ error: "Forbidden." }, { status: 403 });
  }

  if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return jsonResponse(cachedResult);
  }

  try {
    const repository = Deno.env.get("GITHUB_REPOSITORY") || DEFAULT_GITHUB_REPOSITORY;
    const token = Deno.env.get("GITHUB_TOKEN") || requiredEnv("GITHUB_SCREENSHOT_DISPATCH_TOKEN");
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dota2-league-storage-status",
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(String(payload?.message || `GitHub API request failed with status ${response.status}.`));
    }

    const sizeKilobytes = Number(payload?.size);
    if (!Number.isFinite(sizeKilobytes) || sizeKilobytes < 0) {
      throw new Error("GitHub API did not return a valid repository size.");
    }

    cachedResult = {
      repository,
      sizeBytes: sizeKilobytes * 1024,
      checkedAt: new Date().toISOString(),
    };
    cachedAt = Date.now();
    return jsonResponse(cachedResult);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to read GitHub repository size." },
      { status: 502 },
    );
  }
});
