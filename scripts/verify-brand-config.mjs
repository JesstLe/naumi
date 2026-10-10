import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { transformSync } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";

const root = path.resolve(import.meta.dirname, "..");
let checks = 0;
function load(relative, env = {}) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  const code = transformSync(source, { loader: "ts", format: "cjs" }).code;
  const sandbox = { module: { exports: {} }, process: { env }, URL,
    require(name) {
      assert.equal(name, "server-only");
      return {};
    } };
  vm.runInNewContext(code, sandbox, { filename: relative });
  return sandbox.module.exports;
}
function eq(actual, expected) { assert.equal(actual, expected); checks++; }
function cloudMarkup(url) {
  const code = transformSync(fs.readFileSync(path.join(root, "src/components/operator/cloud-modal.tsx"), "utf8"),
    { loader: "tsx", jsx: "automatic", format: "cjs" }).code;
  const sandbox = { module: { exports: {} }, process: { env: { NEXT_PUBLIC_CLOUD_BUY_URL: url } }, URL,
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "lucide-react") return { Check: () => null, Cloud: () => null, ExternalLink: () => null };
      if (name === "@/components/ui/modal") return { Modal: ({ children }) => React.createElement("div", null, children) };
      if (name === "@/components/ui/button") return { Button: ({ children, asChild, disabled }) =>
        asChild ? children : React.createElement("button", { disabled }, children) };
      throw new Error(`Unexpected import: ${name}`);
    } };
  vm.runInNewContext(code, sandbox);
  return renderToStaticMarkup(React.createElement(sandbox.module.exports.CloudModal, { open: true, onClose() {} }));
}

const brand = load("src/lib/brand.ts");
eq(brand.BRAND, "Naumi");
for (const key of ["BRAND_LOGO", "BRAND_CANVAS_LOGO", "BRAND_FAVICON", "BRAND_SQUARE_LOGO"]) {
  eq(brand[key], key === "BRAND_LOGO" ? "/brand/naumi/symbol-black.svg" : key === "BRAND_CANVAS_LOGO" ? "/brand/naumi/app-dark.svg" : "/brand/naumi/app-dark.png");
  eq(fs.existsSync(path.join(root, "public", brand[key])), true);
}
eq(brand.BRAND_LOGO_HAS_TEXT, false);
eq(brand.BRAND_EMAIL, "admin@naumi.local");
eq(brand.BRAND_PARENT_URL, "");
const custom = load("src/lib/brand.ts", {
  NEXT_PUBLIC_BRAND_NAME: " Custom ", NEXT_PUBLIC_BRAND_LOGO: "/custom.png",
  NEXT_PUBLIC_BRAND_CANVAS_LOGO: "/canvas.png", NEXT_PUBLIC_BRAND_FAVICON: "/favicon.png",
  NEXT_PUBLIC_BRAND_SQUARE_LOGO: "/square.png", NEXT_PUBLIC_BRAND_LOGO_HAS_TEXT: "true",
});
eq(custom.BRAND, "Custom");
eq(custom.BRAND_CANVAS_LOGO, "/canvas.png");
eq(custom.BRAND_FAVICON, "/favicon.png");
eq(custom.BRAND_SQUARE_LOGO, "/square.png");
eq(custom.BRAND_LOGO_HAS_TEXT, true);
const fallback = load("src/lib/brand.ts", { NEXT_PUBLIC_BRAND_LOGO: "/custom.png" });
eq(fallback.BRAND_CANVAS_LOGO, "/custom.png");
eq(fallback.BRAND_FAVICON, "/custom.png");
eq(fallback.BRAND_SQUARE_LOGO, "/custom.png");
const blank = load("src/lib/brand.ts", { NEXT_PUBLIC_BRAND_LOGO: "   ", NEXT_PUBLIC_BRAND_FAVICON: " " });
eq(blank.BRAND_LOGO, brand.BRAND_LOGO);
eq(blank.BRAND_CANVAS_LOGO, brand.BRAND_CANVAS_LOGO);
eq(blank.BRAND_FAVICON, brand.BRAND_FAVICON);
eq(load("src/lib/brand.ts", { NEXT_PUBLIC_BRAND_FAVICON: "/only-favicon.svg" }).BRAND_SQUARE_LOGO, "/only-favicon.svg");

const identity = load("src/lib/account-identity.ts");
eq(identity.PHONE_DOMAIN, "phone.naumi.local");
eq(identity.isPhoneAccount("13800138000@phone.naumi.local"), true);
eq(identity.displayEmail("13800138000@phone.naumi.local"), "");
eq(identity.loginIdentifierToEmail(" Test "), "test@username.naumi.local");
const existing = load("src/lib/account-identity.ts", {
  NEXT_PUBLIC_PHONE_EMAIL_DOMAIN: "phone.existing.invalid",
});
eq(existing.isPhoneAccount("13800138000@phone.existing.invalid"), true);
eq(existing.displayEmail("13800138000@phone.existing.invalid"), "");

const issuer = load("src/lib/edition.ts");
eq(issuer.isLicenseIssuerHost("localhost"), false);
eq(issuer.isLicenseIssuerHost(""), false);
eq(load("src/lib/edition.ts", { LICENSE_ISSUER: "false" }).isLicenseIssuerHost("localhost"), false);
eq(load("src/lib/edition.ts", { LICENSE_ISSUER: "true" }).isLicenseIssuerHost("localhost"), true);
const configured = load("src/lib/edition.ts", { LICENSE_SERVER_URL: "https://issuer.example:8443" });
eq(configured.isLicenseIssuerHost("issuer.example:8443"), true);
eq(configured.isLicenseIssuerHost("different.example"), false);
eq(load("src/lib/edition.ts", { LICENSE_SERVER_URL: "bad" }).isLicenseIssuerHost("localhost"), false);
eq(load("src/lib/edition.ts", { LICENSE_SERVER_URL: "file://issuer.example" }).isLicenseIssuerHost("issuer.example"), false);
eq(load("src/lib/version.ts").updateServer(), "");
eq(load("src/lib/version.ts", { UPDATE_SERVER_URL: " https://updates.example/ " }).updateServer(), "https://updates.example");
eq(cloudMarkup("").includes("disabled"), true);
eq(cloudMarkup("").includes("<a "), false);
eq(cloudMarkup("javascript:alert(1)").includes("<a "), false);
eq(cloudMarkup("https://cloud.example/activate").includes('href="https://cloud.example/activate"'), true);

for (const relative of ["src/components/works/works-client.tsx", "src/components/suite/suite-client.tsx", "src/components/tryon/tryon-client.tsx"]) {
  eq(fs.readFileSync(path.join(root, relative), "utf8").includes('${BRAND}-'), true);
}
eq(fs.readFileSync(path.join(root, "src/app/api/wechat/callback/route.ts"), "utf8").includes("getRuntimeBrand()"), true);
for (const relative of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx"]) {
  eq(fs.readFileSync(path.join(root, relative), "utf8").includes("本站运营方"), true);
}
console.log(`BRAND_CONFIG=PASS checks=${checks}`);
