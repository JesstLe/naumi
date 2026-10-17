/* Run only in an isolated local T3 preview. Tests actual UI, IndexedDB and real export blobs.
   Load via preview_evaluate; runPackagingAudit('carton'|'wrap'|'photo'). Reload removes hooks. */
(() => {
  const audit = { checks: [], requests: [], errors: [], exports: [] };
  window.packagingAudit = audit;
  const check = (v, name) => {
    if (!v) throw Error(name);
    audit.checks.push(name);
  };
  const wait = async (fn) => {
    for (let i = 0; i < 120; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 80));
    }
    throw Error("UI wait timeout");
  };
  const idle = async () => {
    await new Promise((r) => setTimeout(r, 180));
    await wait(() => !document.querySelector(".s3-stage-loading"));
  };
  const click = async (text) => {
    const el = Array.from(document.querySelectorAll("button")).find(
      (e) =>
        e.textContent.trim() === text || e.getAttribute("aria-label") === text,
    );
    if (!el || el.disabled) throw Error("Button unavailable: " + text);
    el.click();
    await idle();
  };
  const set = (label, value) => {
    const e = document.querySelector(`input[aria-label="${label}"]`);
    if (!e) throw Error(label);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(e, String(value));
    e.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith("blob:")) {
      const row = { name: this.download, pending: true };
      audit.exports.push(row);
      fetch(this.href)
        .then((r) => r.blob())
        .then((blob) => {
          row.blob = blob;
          row.size = blob.size;
          row.pending = false;
        });
    } else nativeClick.call(this);
  };
  window.downloadPackagingExport = (index) => {
    const f = audit.exports[index],
      a = document.createElement("a");
    a.href = URL.createObjectURL(f.blob);
    a.download = f.name;
    nativeClick.call(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    return f.name;
  };
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    if (!String(args[0]).startsWith("blob:"))
      audit.requests.push({
        url: String(args[0]),
        method: args[1]?.method || "GET",
      });
    return originalFetch.apply(this, args);
  };
  window.addEventListener("error", (e) => audit.errors.push(e.message));
  window.addEventListener("unhandledrejection", (e) =>
    audit.errors.push(String(e.reason)),
  );
  const view = () =>
    document.querySelector("[data-studio-renderer]").toDataURL();
  const exportCurrent = async (prefix) => {
    set("项目名称", prefix);
    await idle();
    await click("保存工程");
    await click("导出工程");
    await click("导出 GLB");
    await click("导出图片");
    await wait(() => audit.exports.every((x) => !x.pending));
    const items = audit.exports.filter((x) => x.name.startsWith(prefix));
    const project = JSON.parse(
      await items.find((x) => x.name.endsWith(".naumi3d")).blob.text(),
    );
    check(project.version === 3, prefix + " v3 complete export");
    const buffer = await items
      .find((x) => x.name.endsWith(".glb"))
      .blob.arrayBuffer();
    const header = new DataView(buffer);
    check(header.getUint32(0, true) === 0x46546c67, prefix + " actual GLB");
    const doc = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(buffer, 20, header.getUint32(12, true)),
      ),
    );
    check(
      doc.images?.length === 1 && doc.images[0].bufferView !== undefined,
      prefix + " embedded atlas",
    );
    check(
      !JSON.stringify(doc).includes("http://"),
      prefix + " no external resources",
    );
    const png = await createImageBitmap(
      items.find((x) => x.name.endsWith(".png")).blob,
    );
    check(
      png.width === 2048 && png.height === 2048,
      prefix + " PNG decoded 2048",
    );
    png.close();
    audit[prefix] = {
      project,
      meshes: doc.meshes.length,
      nodes: doc.nodes.length,
      bytes: buffer.byteLength,
    };
    return project;
  };
  window.runPackagingAudit = async (phase) => {
    if (phase === "carton") {
      document.querySelector(".s3-packaging-entry button").click();
      await idle();
      await click("试用示例设计");
      check(
        !!document.querySelector("canvas[data-studio-renderer]"),
        "real WebGL renderer",
      );
      const closed = view();
      await click("展开");
      check(closed !== view(), "unfold changes rendered geometry");
      set("折叠程度", 50);
      await idle();
      const halfway = view();
      await click("折成盒");
      check(halfway !== view(), "intermediate to folded");
      for (const face of ["正面", "侧面", "背面", "俯视"]) await click(face);
      await click("45°");
      await click("下载刀模模板 SVG");
      await wait(() => audit.exports.every((x) => !x.pending));
      const svg = await audit.exports
        .find((e) => e.name.endsWith(".svg"))
        .blob.text();
      check(
        svg.includes("stroke-dasharray") && svg.includes("mm"),
        "SVG contains mm and creases",
      );
      await click("放大展开图");
      check(!!document.querySelector('[role="dialog"]'), "large net modal");
      await click("关闭展开图");
      const p = await exportCurrent("Carton-demo");
      check(
        p.packaging.fold === 100 && p.packaging.artwork.startsWith("data:"),
        "carton state and artwork saved",
      );
      check(
        audit["Carton-demo"].meshes === 26,
        "13 outer and 13 unprinted inner faces",
      );
      await click("返回项目");
      check(
        document.body.innerText.includes("Carton-demo"),
        "saved card exists",
      );
      document.querySelector(".s3-project-open").click();
      await idle();
      check(
        !!document.querySelector('img[alt="展开设计稿"]'),
        "local saved artwork reopens",
      );
      await click("返回项目");
    }
    if (phase === "wrap") {
      document.querySelectorAll(".s3-packaging-entry button")[1].click();
      await idle();
      await click("试用示例设计");
      const front = view();
      await click("背面");
      check(front !== view(), "360 back is rendered");
      await click("正面");
      set("标签环绕角度", 60);
      await idle();
      check(front !== view(), "wrap rotation live");
      set("标签环绕角度", 0);
      await idle();
      set("标签高度", 45);
      await idle();
      await click("局部贴图");
      check(
        !!document.querySelector('[aria-label="贴图大小"]'),
        "legacy partial label kept",
      );
      await click("360° 环绕");
      await click("试用示例设计");
      const p = await exportCurrent("Wrap-demo");
      check(!!p.wrap && !!p.label, "full wrap in exported project");
      await click("返回项目");
    }
    if (phase === "photo") {
      await idle();
      await click("360° 环绕");
      await click("试用示例设计");
      await click("背面");
      check(
        document.body.innerText.includes("照片轮廓 / 环绕标签"),
        "photo wrap explicitly switches mode",
      );
      const p = await exportCurrent("Photo-wrap-demo");
      check(
        p.template === "photo-lathe" && !!p.photo && !!p.wrap,
        "photo geometry and label retained",
      );
      await click("返回项目");
    }
    check(audit.errors.length === 0, "runtime errors zero: " + phase);
    check(
      audit.requests.every((x) => x.method === "GET"),
      "no uploads or supplier POST: " + phase,
    );
    return {
      phase,
      checks: audit.checks.length,
      exports: audit.exports.map((e, i) => ({
        index: i,
        name: e.name,
        size: e.size,
      })),
      requests: audit.requests,
      errors: audit.errors,
    };
  };
})();
