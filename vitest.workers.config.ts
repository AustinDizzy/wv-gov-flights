import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./tests/fixtures/workflow-worker.ts",
      // Keep the platform suite fully local. The pool currently defaults this
      // to true even when no binding is marked remote.
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          BETTER_AUTH_SECRET: "worker-test-secret-at-least-32-characters",
          GOOGLE_CLIENT_ID: "worker-test-google-client-id",
          GOOGLE_CLIENT_SECRET: "worker-test-google-client-secret",
        },
        serviceBindings: {
          ASSETS() {
            return new Response("not found", { status: 404 });
          },
        },
      },
    })),
  ],
  test: {
    name: "workers",
    include: ["tests/workers/**/*.test.ts"],
    setupFiles: ["./tests/workers/setup.ts"],
  },
});
