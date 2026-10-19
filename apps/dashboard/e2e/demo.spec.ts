import { expect, test } from "@playwright/test";

/**
 * Demo-mode smoke test: the dashboard must be fully usable with no backend,
 * clearly labeled as mock data.
 */
test("logs in and shows mock devices with a demo banner", async ({ page }) => {
  await page.goto("/login");

  // Demo mode prefills credentials; just submit.
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/devices/);
  await expect(page.getByText(/DEMO MODE/i)).toBeVisible();
  await expect(page.getByText("My Pixel 9")).toBeVisible();
  await expect(page.getByText("Spare tablet")).toBeVisible();
});

test("opens a device detail page", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/devices/);
  await page.getByText("My Pixel 9").click();
  await expect(page.getByText(/Settings & consent/)).toBeVisible();
  await expect(page.getByText(/Danger zone/)).toBeVisible();
});
