import { type Page, expect, test } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("analyst@example.ae");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("country profile renders and switches sectors", async ({ page }) => {
  await signIn(page);
  await page.goto("/country/ARE");
  await expect(page.getByRole("heading", { name: /United Arab Emirates/ })).toBeVisible();
  await expect(page.getByText("AI summary")).toBeVisible();
  await expect(page.getByText("GDP (nominal)").first()).toBeVisible();

  await page.getByRole("tab", { name: "Energy" }).click();
  await expect(page.getByText("Oil production").first()).toBeVisible();
  await expect(page.getByText("Renewables share").first()).toBeVisible();

  await page.getByRole("tab", { name: "Sustainability" }).click();
  await expect(page.getByText("CO₂ per capita").first()).toBeVisible();
});

test("country grid links to profile", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /United Arab Emirates/ }).click();
  await page.waitForURL("**/country/ARE");
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
});

test("unknown ISO3 returns 404", async ({ page }) => {
  await signIn(page);
  const res = await page.goto("/country/XXX");
  expect(res?.status()).toBe(404);
});
