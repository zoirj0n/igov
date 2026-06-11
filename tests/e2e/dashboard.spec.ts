import { type Page, expect, test } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("analyst@example.ae");
  await page.getByLabel("Password").fill("demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

test("dashboard renders KPI tiles and watchlist", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Executive Dashboard/i })).toBeVisible();
  await expect(page.getByText("Partners tracked")).toBeVisible();
  await expect(page.getByText("Watchlist")).toBeVisible();
  await expect(page.getByText("Recent briefings")).toBeVisible();
});

test("locale toggles to AR (RTL)", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "AR", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: /لوحة المعلومات التنفيذية/ })).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("ok");
});
