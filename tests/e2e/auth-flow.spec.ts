import { expect, test } from "@playwright/test";

test.describe("auth + RBAC flow", () => {
  test("unauthed root redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("login as analyst → dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("analyst@example.ae");
    await page.getByLabel("Password").fill("demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Executive Dashboard/ })).toBeVisible();
  });

  test("analyst blocked from /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("analyst@example.ae");
    await page.getByLabel("Password").fill("demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto("/admin");
    await page.waitForURL("**/dashboard");
  });

  test("admin can reach /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@example.ae");
    await page.getByLabel("Password").fill("demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /Admin/i })).toBeVisible();
  });

  test("api/auth/me returns user after login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("lead@example.ae");
    await page.getByLabel("Password").fill("demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    const res = await page.request.get("/api/auth/me");
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.user?.email).toBe("lead@example.ae");
    expect(data.user?.clearance).toBe("confidential");
  });
});
