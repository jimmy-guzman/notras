import { expect, test } from "@playwright/test";

test("should load the home page and display core ui", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("notras");
  await expect(
    page.getByRole("heading", { level: 1, name: "notras" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /new note/i })).toBeVisible();
});

test("should navigate to the new note page", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: /new note/i }).click();
  await expect(page).toHaveURL("/notes/new");
  await expect(
    page.getByRole("textbox", { name: /write your note/i }),
  ).toBeVisible();
});
