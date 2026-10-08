import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createDatabase } from "../db/client";
import { account, session, user, verification } from "../db/schema";
import { adminEmails, appPath, publicOrigin } from "./config";

export function createAuth(env: Env) {
  const allowlist = adminEmails(env);
  return betterAuth({
    appName: "Golden Dome Airways",
    database: drizzleAdapter(createDatabase(env.DB), {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: publicOrigin(env),
    basePath: appPath("/api/auth", env),
    trustedOrigins: [publicOrigin(env)],
    advanced: {
      cookiePrefix: "golden-dome",
      useSecureCookies: publicOrigin(env).startsWith("https://"),
      defaultCookieAttributes: {
        path: appPath("/", env),
        httpOnly: true,
        sameSite: "lax",
        secure: publicOrigin(env).startsWith("https://"),
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        accessType: "online",
        disableDefaultScope: true,
        scope: ["openid", "email", "profile"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          async before(user) {
            const email = user.email.trim().toLocaleLowerCase();
            if (!user.emailVerified || !allowlist.has(email)) return false;
            return { data: { ...user, email } };
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Awaited<ReturnType<Auth["api"]["getSession"]>>;

export async function getAuthSession(request: Request, env: Env): Promise<AuthSession> {
  return createAuth(env).api.getSession({ headers: request.headers });
}

export function isAllowedSession(session: AuthSession, env: { ADMIN_EMAILS: string }): boolean {
  return Boolean(
    session?.user.emailVerified &&
      adminEmails(env).has(session.user.email.trim().toLocaleLowerCase()),
  );
}

export async function requireAdmin(request: Request, env: Env): Promise<NonNullable<AuthSession>> {
  const session = await getAuthSession(request, env);
  if (!session || !isAllowedSession(session, env)) {
    throw new Response("Unauthorized", { status: 401 });
  }
  assertMutationOrigin(request, env);
  return session;
}

export function assertMutationOrigin(
  request: Request,
  env: { PUBLIC_ORIGIN: string },
): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== publicOrigin(env)) {
    throw new Response("Invalid request origin", { status: 403 });
  }
}
