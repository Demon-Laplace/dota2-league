/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createUserScopedClient, parseJson, requireAdmin } from "../_shared/client.ts";
import { assertValidAccessRole, assertValidUsername } from "../_shared/identity.ts";

type AdminSaveUserMappingBody = {
  identityId?: string;
  username?: string;
  role?: string;
  authEmail?: string;
  isActive?: boolean;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
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

  const adminResult = await requireAdmin(clientResult.supabase);
  if ("error" in adminResult) return adminResult.error;

  const bodyResult = await parseJson<AdminSaveUserMappingBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  const identityId = String(bodyResult.data?.identityId ?? "").trim();
  const authEmail = normalizeEmail(bodyResult.data?.authEmail);
  const isActive = bodyResult.data?.isActive !== false;

  let username: string;
  let role: "admin" | "scorekeeper";
  try {
    username = assertValidUsername(bodyResult.data?.username);
    role = assertValidAccessRole(bodyResult.data?.role);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "参数不合法。" }, { status: 400 });
  }

  if (!authEmail || !authEmail.includes("@")) {
    return jsonResponse({ error: "请输入有效邮箱。" }, { status: 400 });
  }

  const { data, error } = await clientResult.supabase.rpc("admin_upsert_auth_identity", {
    p_identity_id: identityId || null,
    p_username: username,
    p_auth_email: authEmail,
    p_role: role,
    p_is_active: isActive,
    p_auth_user_id: null,
  });

  if (error) {
    const status = error.code === "42501"
      ? 403
      : (error.code === "23505"
        ? 409
        : (error.code === "P0002" ? 404 : 400));
    return jsonResponse({ error: error.message }, { status });
  }

  return jsonResponse({
    account: Array.isArray(data) ? (data[0] ?? null) : data,
  });
});
