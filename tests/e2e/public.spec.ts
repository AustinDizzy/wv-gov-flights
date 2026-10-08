import { expect, test } from "@playwright/test";

test("public explorer is accessible and responsive", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Aircraft fleet" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("WVFOIA");
  await expect(page.locator("html")).not.toHaveAttribute("style", /overflow/);
});

test("trip filters use server-rendered controls", async ({ page }) => {
  await page.goto("./trips");
  await expect(page.getByRole("heading", { name: "Trips" })).toBeVisible();
  await expect(page.getByLabel("Search the records")).toBeVisible();
});
