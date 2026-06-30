/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireAdmin,
} from "../_shared/client.ts";
import { validatePassword } from "../_shared/identity.ts";

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
  const password = String(bodyResult.data?.password ?? "");
  if (!identityId) {
    return jsonResponse({ error: "缺少账号标识。" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonResponse({ error: passwordError }, { status: 400 });
  }

  const { data: identityRows, error: identityError } = await clientResult.supabase.rpc("admin_list_auth_identities");

  if (identityError) {
    return jsonResponse({ error: identityError.message }, { status: 400 });
  }

  const identity = (identityRows || []).find((entry) => entry.id === identityId) || null;

  if (!identity || !identity.auth_user_id) {
    return jsonResponse({ error: "账号还未绑定 Supabase Auth 用户。" }, { status: 404 });
  }

  const serviceClient = createServiceRoleClient();
  const { error: resetError } = await serviceClient.auth.admin.updateUserById(identity.auth_user_id, {
    password,
  });

  if (resetError) {
    return jsonResponse({ error: resetError.message }, { status: 400 });
  }

  return jsonResponse({
    success: true,
    username: identity.username,
  });
});
