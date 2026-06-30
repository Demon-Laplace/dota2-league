/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createUserScopedClient, parseJson, requireAdmin } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, { status: 405 });
  }

  const clientResult = createUserScopedClient(req);
  if ("error" in clientResult) return clientResult.error;

  const adminResult = await requireAdmin(clientResult.supabase);
  if ("error" in adminResult) return adminResult.error;

  const bodyResult = await parseJson(req);
  if ("error" in bodyResult) return bodyResult.error;

  const identityId = String(bodyResult.data?.identityId ?? "").trim();
  const isActive = Boolean(bodyResult.data?.isActive);
  if (!identityId) {
    return jsonResponse({ error: "缺少账号标识。" }, { status: 400 });
  }

  const { data: identityRows, error: existingError } = await clientResult.supabase.rpc("admin_list_auth_identities");

  if (existingError) {
    return jsonResponse({ error: existingError.message }, { status: 400 });
  }

  const existing = (identityRows || []).find((entry) => entry.id === identityId) || null;

  if (!existing) {
    return jsonResponse({ error: "账号不存在。" }, { status: 404 });
  }

  if (!isActive && existing.auth_user_id === adminResult.user.id) {
    return jsonResponse({ error: "不能停用当前登录账号。" }, { status: 400 });
  }

  const { data, error } = await clientResult.supabase.rpc("admin_upsert_auth_identity", {
    p_identity_id: existing.id,
    p_username: existing.username,
    p_auth_email: existing.auth_email,
    p_role: existing.role,
    p_is_active: isActive,
    p_auth_user_id: existing.auth_user_id,
  });

  if (error) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }

  return jsonResponse({
    account: Array.isArray(data) ? (data[0] ?? null) : data,
  });
});
