export const DEFAULT_BASE_PATH = "/wv-gov-flights";

export function normalizeBasePath(value: string | undefined): string {
  const path = (value || DEFAULT_BASE_PATH).trim();
  if (!path || path === "/") return "";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

export function appPath(path: string, env?: { APP_BASE_PATH: string }): string {
  const base = normalizeBasePath(env?.APP_BASE_PATH);
  const suffix = path === "/" ? "" : `/${path.replace(/^\/+/, "")}`;
  return `${base}${suffix}` || "/";
}

export function publicOrigin(env: { PUBLIC_ORIGIN: string }): string {
  return env.PUBLIC_ORIGIN.replace(/\/+$/, "");
}

export function absoluteAppUrl(
  path: string,
  env: { PUBLIC_ORIGIN: string; APP_BASE_PATH: string },
): string {
  return `${publicOrigin(env)}${appPath(path, env)}`;
}

export function adminEmails(env: { ADMIN_EMAILS: string }): Set<string> {
  return new Set(
    env.ADMIN_EMAILS.split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}
