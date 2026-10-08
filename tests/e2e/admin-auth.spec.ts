import { expect, test } from "@playwright/test";

// Astro normalizes the path (base removal, duplicate leading slashes, URI
// decoding) before matching a route, so each spelling below reaches an admin
// page. All of them must still be redirected to the login page.
const adminPathVariants = [
  "admin",
  "admin/",
  "/admin",
  "%61dmin",
  "/%61dmin",
  "adm%69n/upload",
  "/admin/upload",
  "admin/reports/1",
  "/admin/reports/1",
  "admin/observed-flights",
];

for (const variant of adminPathVariants) {
  test(`anonymous request to ${JSON.stringify(variant)} redirects to login`, async ({ request, baseURL }) => {
    // Build the URL by concatenation: resolving `//admin` against baseURL
    // would treat it as a protocol-relative host instead of a path.
    const url = `${baseURL!.replace(/\/+$/, "")}/${variant}`;
    const response = await request.get(url, { maxRedirects: 0 });
    expect(response.status(), url).toBe(303);
    expect(new URL(response.headers().location, url).pathname).toMatch(/\/admin\/login$/);
  });
}

test("login page stays reachable without a session", async ({ request }) => {
  const response = await request.get("./admin/login", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
});
