import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

// The actual API handlers are bundled with deterministic configuration readers.
// No database, credentials, production access or supplier transport is available.
const source = resolve(process.env.IMAGEN4_SOURCE_ROOT || ".");
const baseline = process.argv.includes("--baseline");
const out = resolve("output/imagen4-unlist-20261021");
const { mkdir } = await import("node:fs/promises");
await mkdir(out, { recursive: true });
const temp = await mkdtemp(join(out, "handler-fixture-"));
const require = createRequire(import.meta.url);
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const imagen = { id: "imagen-4.0-generate-preview-portrait", label: "Imagen-4", supportsEdit: true, qualitySupported: false };
const gpt = { id: "gpt-image-2", label: "GPT Image", supportsEdit: true, qualitySupported: true };
const banana = { id: "gemini-3.1-flash-image-square", label: "Nano Banana 2", supportsEdit: true };
const catalog = (models = [imagen, gpt, banana]) => ({
  version: 132, feature: "canvas.image", available: true, defaultModelId: models[0]?.id,
  models, bindings: { "image.generate": imagen.id, "image.edit": gpt.id },
  bindingCapabilities: { "image.generate": { qualities: ["low"] }, "image.edit": { qualities: ["medium"] } },
});
const fixture = globalThis.__imagenFixture = { managed: true, catalog: catalog(), models: [imagen, gpt, banana], userDefault: null, replicate: false };
const mocks = {
  "@/lib/db": "export const dbEnabled=false; export async function creditMeteringEnabled(){return true}",
  "@/lib/storage": "export const storageEnabled=true",
  "@/lib/auth-mode": "export const authMode='mock'",
  "@/lib/native-auth": "export async function multiUserEnabled(){return false}",
  "@/lib/mailer": "export async function smtpConfigured(){return false}",
  "@/lib/settings": "export async function getOpenAISettings(){return {model:'imagen-4.0-generate-preview-portrait'}};export async function getCutoutSettings(){return {backend:'replicate',replicateToken:globalThis.__imagenFixture.replicate?'fixture-only':''}}",
  "@/lib/image-model-catalog": "export async function getImageModelCatalog(){return globalThis.__imagenFixture.models};export async function getUserDefaultImageModel(){return globalThis.__imagenFixture.userDefault}",
  "@/lib/image-quality": "export function imageQualityCapable(){return true}",
  "@/lib/request-auth": "export async function authenticatedEmail(){return null}",
  "@/lib/commerce": "export const betaPreviewEnabled=false",
  "@/lib/model-config/requests": "export async function modelConfigurationEnabled(){return globalThis.__imagenFixture.managed}",
  "@/lib/model-config/server": "export async function getModelRuntime(){return {current:async()=>({version:132,config:{}}),publicCatalog:async()=>structuredClone(globalThis.__imagenFixture.catalog)}};export async function getModelAdministration(){return {repo:{byVersion:async()=>({config:{business:{},bindings:{}}})}}}",
  "@/lib/billing/rules/registry": "export function isFeatureId(f){return ['canvas.image','image.generate','text.generate','tool.cutout'].includes(f)}",
  "@/lib/model-config/business": "export const FEATURE_BINDINGS={'canvas.image':'image.edit','image.generate':'image.generate','text.generate':'text.generate','tool.cutout':'image.cutout'}",
  "@/lib/model-config/bindings": "export const MODEL_BINDINGS={'image.edit':{modality:'image'},'image.generate':{modality:'image'},'image.cutout':{modality:'image'},'text.generate':{modality:'text'}}",
  "@/lib/model-config/types": "export class ModelConfigError extends Error {}",
};
mocks["@/platform/db/pool"] = "export const dbEnabled=false";
mocks["@/lib/billing/runtime"] = "export async function creditMeteringEnabled(){return true}";
mocks["@/lib/accounts/mode"] = mocks["@/lib/native-auth"];
mocks["@/lib/model-config/availability"] = mocks["@/lib/model-config/requests"];
mocks["@/lib/model-config/feature-model-policy"] = mocks["@/lib/model-config/business"];
async function bundle(entry, name, mocked = false) {
  const file = join(temp, name + ".cjs");
  await build({ entryPoints: [join(source, entry)], bundle: true, platform: "node", format: "cjs", outfile: file,
    external: ["next/server"], logLevel: "silent", plugins: [{ name: "isolated-readers", setup(b) {
      b.onResolve({ filter: /^@\// }, args => {
        if (mocked && mocks[args.path]) return { path: args.path, namespace: "fixture" };
        return { path: join(source, "src", args.path.slice(2) + ".ts") };
      });
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  return require(file);
}
try {
  const configHandler = await bundle("src/app/api/config/route.ts", "config", true);
  const modelsHandler = await bundle("src/app/api/models/route.ts", "models", true);
  const workbench = await bundle("src/lib/reference-workbench/model-options.ts", "workbench");
  const getConfig = async () => {
    const response = await configHandler.GET(new Request("http://fixture.test/api/config"));
    check(response.status === 200, "config HTTP"); return response.json();
  };
  const getModels = async feature => {
    const response = await modelsHandler.GET(new Request("http://fixture.test/api/models?feature=" + feature));
    check(response.status === 200, "models HTTP");
    check(response.headers.get("cache-control") === "no-store", "catalog uncached"); return response.json();
  };
  if (baseline) {
    const config = await getConfig(), models = await getModels("canvas.image");
    check(config.imageModels.some(m => m.id === imagen.id), "baseline config exposes Imagen4");
    check(config.defaultImageModel === imagen.id, "baseline default exposes Imagen4");
    check(models.models.some(m => m.id === imagen.id), "baseline canvas exposes Imagen4");
    check(workbench.workbenchModelOptions([imagen, gpt]).some(m => m.label === imagen.label), "baseline workbench exposes Imagen4");
    console.log("BASELINE=REPRODUCED CONFIG=IMAGEN4 CANVAS=IMAGEN4 DEFAULT=IMAGEN4 WORKBENCH=IMAGEN4 SUPPLIER_CALLS=0");
  } else {
    const visibility = await bundle("src/lib/frontend-image-models.ts", "visibility");
    for (const id of ["Imagen-4", "imagen4", "imagen-4.0-generate-preview", "imagen-4.0-generate-preview-landscape", "google/imagen-4.0-fast-generate-001", "byok:imagen-4.0-generate-001"])
      check(!visibility.isFrontendImageModelVisible({ id }), "retire " + id);
    check(!visibility.isFrontendImageModelVisible({ id: "public-alias", label: "Google Imagen 4" }), "label alias");
    for (const id of ["imagen-3.0-generate-001", "imagen-40", "imagen-4k", "gpt-image-2", "jimeng-image-5.0-pro", "custom-landscape"])
      check(visibility.isFrontendImageModelVisible({ id }), "unrelated model retained " + id);
    const narrowed = visibility.frontendImageCatalog({ ...catalog([gpt]), bindings: { "image.edit": "edit-only-model", "image.generate": imagen.id }, bindingCapabilities: { "image.edit": { qualities: ["high"] }, "image.generate": { qualities: ["low"] } } });
    check(narrowed.bindings["image.edit"] === "edit-only-model" && narrowed.bindingCapabilities["image.edit"].qualities[0] === "high", "unrelated binding outside generation list retained");
    const processor = visibility.frontendImageCatalog({ models: [], available: true, bindingCapabilities: { "image.cutout": { qualities: ["medium"] } } });
    check(processor.available === true && processor.bindingCapabilities["image.cutout"].qualities[0] === "medium", "empty admin processor availability unchanged");
    const before = JSON.stringify(fixture.catalog);
    for (const managed of [true, false]) {
      fixture.managed = managed;
      for (const userDefault of [null, imagen.id, gpt.id]) {
        fixture.userDefault = userDefault;
        const config = await getConfig();
        check(!config.imageModels.some(m => m.id === imagen.id), "config list");
        check(config.defaultImageModel === gpt.id, "hidden saved/default chooses visible");
        check(config.imageModels.length === 2, "other models unchanged");
        if (managed) check(config.imageModelBindings["image.generate"] === undefined && config.imageModelBindings["image.edit"] === gpt.id, "only hidden binding removed");
      }
    }
    fixture.managed = true;
    const models = await getModels("canvas.image");
    check(models.models.length === 2 && models.defaultModelId === gpt.id, "canvas models and default");
    check(!models.bindings["image.generate"] && !models.bindingCapabilities["image.generate"], "no hidden metadata");
    check(models.bindingCapabilities["image.edit"].qualities[0] === "medium", "visible binding capability retained");
    const opts = workbench.workbenchModelOptions([imagen, gpt, banana]);
    check(opts.length === 2 && !opts.some(m => m.id === imagen.id), "workbench list");
    check(workbench.workbenchModelSelection(imagen.id, opts) === "", "retired workbench saved choice cleared");
    check(JSON.stringify(fixture.catalog) === before, "admin/frozen config unmodified");
    fixture.catalog = catalog([imagen]); fixture.models = [imagen]; fixture.userDefault = imagen.id;
    const empty = await getModels("canvas.image"), emptyConfig = await getConfig();
    check(empty.models.length === 0 && !empty.defaultModelId && empty.available === false, "all-retired no fallback");
    check(emptyConfig.imageModels.length === 0 && emptyConfig.defaultImageModel === "", "legacy fallback cannot resurrect retired model");
    fixture.catalog = catalog([{ ...imagen, modality: "text" }]);
    check((await getModels("text.generate")).models[0].id === imagen.id, "text catalog untouched");
    fixture.catalog = { ...catalog([]), available: false }; fixture.replicate = true;
    const cutout = await getModels("tool.cutout");
    check(cutout.available === true && cutout.supported === false && cutout.models.length === 0, "standalone cutout unchanged");
    console.log(`MODIFIED=PASS CHECKS=${checks} CONFIG=HIDDEN CANVAS=HIDDEN WORKBENCH=HIDDEN SAVED_DEFAULT=VISIBLE EMPTY=NO_RESURRECTION ADMIN_FROZEN=UNCHANGED SUPPLIER_CALLS=0`);
  }
} finally {
  delete globalThis.__imagenFixture;
  await rm(temp, { recursive: true, force: true });
}
