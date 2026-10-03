import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "billing-ui.spec.ts", workers: 1, use: { baseURL: "http://127.0.0.1:31089", channel: "msedge", headless: true, viewport: { width: 1440, height: 960 } }, reporter: "list", outputDir: "../output/billing-20261003/ui" });
