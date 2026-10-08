import { env } from "cloudflare:workers";
import { defineMiddleware } from "astro:middleware";
import { appPath } from "./lib/config";
import { getAuthSession, isAllowedSession } from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  // Match on the route Astro actually resolved, not the raw request path. Astro
  // strips the base, collapses leading slashes and decodes the URL before
  // routing, so raw-path checks miss variants like `//admin` or `/%61dmin`.
  const route = context.routePattern;
  const isLogin = route === "/admin/login";
  const isProtected = route === "/admin" || route.startsWith("/admin/");

  context.locals.user = null;
  context.locals.session = null;
  context.locals.isAdmin = false;

  // Public requests must not pay for an authentication/session lookup. Admin
  // mutations authenticate again inside their route handlers.
  if (isProtected) {
    const session = await getAuthSession(context.request, env);
    context.locals.user = session?.user ?? null;
    context.locals.session = session?.session ?? null;
    context.locals.isAdmin = isAllowedSession(session, env);
    if (!isLogin && !context.locals.isAdmin) {
      return context.redirect(appPath("/admin/login", env), 303);
    }
  }
  return next();
});
