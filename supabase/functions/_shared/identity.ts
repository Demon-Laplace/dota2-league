export const USERNAME_PATTERN = /^(?=.{1,10}$)[\u4e00-\u9fff]+$/u;

export type AccessRole = "admin" | "scorekeeper";

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidUsername(value: unknown) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function assertValidUsername(value: unknown) {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) {
    throw new Error("用户名只能包含 1-10 位中文。");
  }
  return username;
}

export function usernameToAuthEmail(username: string) {
  return `user_${username}@internal.local`;
}

export function normalizeAccessRole(value: unknown): AccessRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "scorekeeper" || role === "scorer") return "scorekeeper";
  return null;
}

export function assertValidAccessRole(value: unknown): AccessRole {
  const role = normalizeAccessRole(value);
  if (!role) {
    throw new Error("角色只能是 admin 或 scorekeeper。");
  }
  return role;
}

export function validatePassword(value: unknown) {
  const password = String(value ?? "");
  if (password.length < 8) {
    return "密码长度至少为 8 位。";
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "密码至少需要包含字母和数字。";
  }
  return null;
}
