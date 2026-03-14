import { Scalar } from "@scalar/hono-api-reference";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";

import { assetsApp } from "./assets/assets.http";
import { exportApp } from "./export/export.http";
import { hono } from "./lib/hono";
import { openapi } from "./lib/openapi";
import { remindersApp } from "./reminders/reminders.http";

export const app = hono().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/assets", assetsApp);
app.route("/export", exportApp);
app.route("/reminders", remindersApp);

const apiSchema = app.getOpenAPI31Document({
  info: openapi.info,
  openapi: openapi.version,
});

app.get("/openapi.json", (c) => c.json(apiSchema));

app.get(
  "/docs",
  Scalar({
    favicon: "/api/icons/32",
    pageTitle: openapi.info.title,
    sources: [{ content: apiSchema, title: openapi.info.title }],
  }),
);

let cachedMarkdown: string | undefined;

app.get("/llms.txt", async (c) => {
  cachedMarkdown ??= await createMarkdownFromOpenApi(JSON.stringify(apiSchema));

  c.header("Content-Type", "text/plain; charset=utf-8");

  return c.text(cachedMarkdown);
});
