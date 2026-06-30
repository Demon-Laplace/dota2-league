/// <reference path="../_shared/deno-globals.d.ts" />

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  createServiceRoleClient,
  createUserScopedClient,
  parseJson,
  requireAdmin,
} from "../_shared/client.ts";
import {
  assertValidAccessRole,
  assertValidUsername,
  usernameToAuthEmail,
  validatePassword,
} from "../_shared/identity.ts";

type AdminCreateUserBody = {
  username?: string;
  role?: string;
  password?: string;
};

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

  const bodyResult = await parseJson<AdminCreateUserBody>(req);
  if ("error" in bodyResult) return bodyResult.error;

  let username: string;
  let role: "admin" | "scorekeeper";
  try {
    username = assertValidUsername(bodyResult.data?.username);
    role = assertValidAccessRole(bodyResult.data?.role);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "参数不合法。" }, { status: 400 });
  }

  const password = String(bodyResult.data?.password ?? "");
  const passwordError = validatePassword(password);
  if (passwordError) {
    return jsonResponse({ error: passwordError }, { status: 400 });
  }

  const authEmail = usernameToAuthEmail(username);

  const serviceClient = createServiceRoleClient();
  const { data: createdAuthUser, error: createAuthError } = await serviceClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      username,
      role,
    },
  });

  if (createAuthError || !createdAuthUser.user) {
    return jsonResponse({ error: createAuthError?.message || "账号创建失败。" }, { status: 400 });
  }

  const { data: identityRows, error: identityError } = await clientResult.supabase.rpc("admin_upsert_auth_identity", {
    p_identity_id: null,
    p_username: username,
    p_auth_email: authEmail,
    p_role: role,
    p_is_active: true,
    p_auth_user_id: createdAuthUser.user.id,
  });

  if (identityError) {
    await serviceClient.auth.admin.deleteUser(createdAuthUser.user.id);
    const status = identityError.code === "23505" ? 409 : 400;
    return jsonResponse({ error: identityError.message }, { status });
  }

  return jsonResponse({
    account: Array.isArray(identityRows) ? (identityRows[0] ?? null) : identityRows,
  });
});
