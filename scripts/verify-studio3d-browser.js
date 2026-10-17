/* Run this source using the T3 collaborative browser's preview_evaluate on local /studio3d.
 * No Playwright/CDP connection, cloud credentials or real supplier requests.
 * Then call runStudioAudit('core'), runStudioAudit('imports'), runStudioAudit('finish').
 */
(() => {
  const audit = { checks: [], errors: [], files: [], projectId: null };
  window.studioAudit = audit;
  window.addEventListener("error", (event) => audit.errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) =>
    audit.errors.push(String(event.reason)),
  );
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith("blob:")) {
      const entry = { name: this.download, pending: true };
      audit.files.push(entry);
      fetch(this.href)
        .then((r) => r.blob())
        .then((blob) => {
          entry.blob = blob;
          entry.bytes = blob.size;
          entry.pending = false;
        });
      return;
    }
    return originalClick.call(this);
  };
  const wait = async (fn) => {
    for (let i = 0; i < 250; i++) {
      if (fn()) return;
      await new Promise((r) => setTimeout(r, 80));
    }
    throw Error("browser wait timeout");
  };
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 120));
    await wait(
      () =>
        !document.querySelector(".s3-stage-loading") &&
        !document.querySelector(".s3-busy"),
    );
  };
  const check = (value, name) => {
    if (!value) throw Error(name);
    audit.checks.push(name);
  };
  const click = async (text) => {
    const button = [...document.querySelectorAll(".s3 button")].find(
      (b) => b.textContent.trim() === text && b.getClientRects().length,
    );
    if (!button || button.disabled)
      throw Error("Missing/disabled button " + text);
    button.click();
    await settle();
  };
  const set = (label, value) => {
    const input = document.querySelector(`[aria-label="${label}"]`);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const upload = async (label, blob, name, type) => {
    const input = document.querySelector(`[aria-label="${label}"]`),
      dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
  };
  const collect = async (name, blob) => {
    const response = await fetch(`http://127.0.0.1:14731/${name}`, {
      method: "POST",
      body: blob,
    });
    if (!response.ok) throw Error("Collector failed");
  };
  const exported = async (name) => {
    await wait(
      () => audit.files.length && audit.files.every((f) => !f.pending),
    );
    const file = audit.files.at(-1);
    check(file.bytes > 100, `nonempty ${name}`);
    await collect(name, file.blob);
    return file.blob;
  };
  const stored = async () => {
    const open = indexedDB.open("naumi-studio3d-v1"),
      db = await new Promise((r, j) => {
        open.onsuccess = () => r(open.result);
        open.onerror = j;
      });
    try {
      const get = db
        .transaction("projects")
        .objectStore("projects")
        .index("owner")
        .getAll("guest");
      return await new Promise((r, j) => {
        get.onsuccess = () => r(get.result);
        get.onerror = j;
      });
    } finally {
      db.close();
    }
  };
  const home = async () => {
    document.querySelector('[aria-label="返回项目"]').click();
    await settle();
  };
  window.runStudioAudit = async (phase) => {
    if (phase === "core") {
      check(
        document.querySelectorAll(".s3-template").length === 3,
        "three template entries",
      );
      document.querySelector(".s3-template").click();
      await settle();
      check(
        !!document.querySelector("[data-studio-renderer]"),
        "real WebGL canvas",
      );
      const before = document
        .querySelector("[data-studio-renderer]")
        .toDataURL();
      set("项目名称", "3D验收 · 植萃精华");
      set("高度", "160");
      await settle();
      check(
        before !== document.querySelector("[data-studio-renderer]").toDataURL(),
        "parameter changes actual rendering",
      );
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 500;
      const c = canvas.getContext("2d");
      c.fillStyle = "#f1eddf";
      c.fillRect(0, 0, 600, 500);
      c.fillStyle = "#263b2b";
      c.textAlign = "center";
      c.font = "bold 48px serif";
      c.fillText("N A U M I", 300, 150);
      c.font = "24px sans-serif";
      c.fillText("BOTANICAL SERUM", 300, 220);
      c.fillRect(170, 265, 260, 3);
      c.font = "20px sans-serif";
      c.fillText("30 ml / 1.0 fl oz", 300, 380);
      await upload(
        "上传标签贴图",
        await new Promise((r) => canvas.toBlob(r)),
        "label.png",
        "image/png",
      );
      check(
        !!document.querySelector(".s3-label-preview img"),
        "label displayed",
      );
      await click("材质");
      await click("玻璃");
      await click("金属");
      await click("亮面");
      await click("哑光");
      await click("场景");
      await click("白底电商");
      await click("侧光质感");
      await click("柔光棚拍");
      await click("正面");
      await click("出图");
      await click("3:4");
      await click("1K");
      await click("保存工程");
      const rows = await stored(),
        p = rows.find((r) => r.project.name === "3D验收 · 植萃精华").project;
      audit.projectId = p.id;
      check(
        p.height === 160 && p.label?.startsWith("data:image/png"),
        "IndexedDB geometry+texture",
      );
      check(!!p.camera, "saved camera pose");
      await click("导出工程");
      audit.projectBlob = await exported("project.naumi3d");
      const parsed = JSON.parse(await audit.projectBlob.text());
      check(
        parsed.label === p.label && parsed.id === p.id,
        "complete project export",
      );
      document.querySelector(".s3-check input").click();
      await settle();
      await click("当前视角 PNG");
      const png = await exported("portrait.png"),
        bitmap = await createImageBitmap(png);
      check(
        bitmap.width === 768 && bitmap.height === 1024,
        "PNG 768x1024 exact",
      );
      const pixels = document.createElement("canvas");
      pixels.width = 768;
      pixels.height = 1024;
      const ctx = pixels.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      check(ctx.getImageData(0, 0, 1, 1).data[3] === 0, "transparent corner");
      check(
        ctx.getImageData(384, 512, 1, 1).data[3] > 0,
        "opaque product survives",
      );
      const view = document.querySelector("[data-studio-renderer]");
      check(
        Math.abs(view.clientWidth / view.clientHeight - 0.75) < 0.01,
        "preview ratio matches output",
      );
      document.querySelector(".s3-check input").click();
      await settle();
      await click("四视角打包 ZIP");
      await exported("multiview.zip");
      await click("导出 GLB");
      audit.glbBlob = await exported("product.glb");
      const binary = await audit.glbBlob.arrayBuffer(),
        v = new DataView(binary),
        doc = JSON.parse(
          new TextDecoder().decode(
            new Uint8Array(binary, 20, v.getUint32(12, true)),
          ),
        );
      check(
        v.getUint32(0, true) === 0x46546c67 && doc.meshes.length === 6,
        "real GLB six meshes",
      );
      check(
        doc.images.length === 1 && !doc.images[0].uri,
        "GLB texture embedded",
      );
      await click("保存工程");
      await home();
      const card = [...document.querySelectorAll(".s3-project-open")].find(
        (c) => c.innerText.includes("3D验收"),
      );
      check(!!card, "saved project card");
      card.click();
      await settle();
      check(
        document.querySelector('[aria-label="高度"]').value === "160" &&
          !!document.querySelector(".s3-label-preview img"),
        "reopen geometry and texture",
      );
    }
    if (phase === "imports") {
      await home();
      await upload(
        "导入GLB模型",
        audit.glbBlob,
        "product.glb",
        "model/gltf-binary",
      );
      check(!document.querySelector(".s3-error"), "GLB roundtrip loads");
      check(
        document
          .querySelector(".s3-editor")
          .innerText.includes("原始网格与材质"),
        "import retains original materials",
      );
      await click("出图");
      await click("4K");
      await click("当前视角 PNG");
      let blob = await exported("square4k.png"),
        bitmap = await createImageBitmap(blob);
      check(
        bitmap.width === 4096 && bitmap.height === 4096,
        "4K square actual",
      );
      bitmap.close();
      await click("4:3");
      await click("2K");
      await click("当前视角 PNG");
      blob = await exported("landscape2k.png");
      bitmap = await createImageBitmap(blob);
      check(
        bitmap.width === 2048 && bitmap.height === 1536,
        "2K landscape actual",
      );
      bitmap.close();
      await click("保存工程");
      await home();
      await upload(
        "导入工程文件",
        audit.projectBlob,
        "restored.naumi3d",
        "application/json",
      );
      check(
        document.querySelector('[aria-label="高度"]').value === "160" &&
          !!document.querySelector(".s3-label-preview img"),
        "import full editable engineering project",
      );
      await click("保存工程");
      const rows = await stored();
      check(
        rows.filter((r) => r.project.name === "3D验收 · 植萃精华").length >= 2,
        "import allocates new ID without overwrite",
      );
      await home();
      await upload(
        "导入工程文件",
        new Blob(['{"version":999}']),
        "bad.naumi3d",
        "application/json",
      );
      check(
        !!document.querySelector(".s3-error") &&
          !document.querySelector(".s3-editor"),
        "malformed project remains in library",
      );
      document.querySelector('[aria-label="关闭错误"]').click();
      const source = JSON.parse(await audit.projectBlob.text());
      source.label = "https://example.invalid/secret.png";
      await upload(
        "导入工程文件",
        new Blob([JSON.stringify(source)]),
        "remote.naumi3d",
        "application/json",
      );
      check(
        !!document.querySelector(".s3-error") &&
          !document.querySelector(".s3-editor"),
        "remote texture import rejected",
      );
      document.querySelector('[aria-label="关闭错误"]').click();
      await upload(
        "导入GLB模型",
        new Blob(["not a model"]),
        "bad.glb",
        "model/gltf-binary",
      );
      check(
        !!document.querySelector(".s3-error") &&
          !document.querySelector(".s3-editor"),
        "bad GLB rejected",
      );
      document.querySelector('[aria-label="关闭错误"]').click();
      document.querySelectorAll(".s3-template")[1].click();
      await settle();
      check(!!document.querySelector("[data-studio-renderer]"), "jar renders");
      await click("保存工程");
      await home();
      document.querySelectorAll(".s3-template")[2].click();
      await settle();
      check(!!document.querySelector('[aria-label="深度"]'), "box dimensions");
      await click("保存工程");
      await home();
      [...document.querySelectorAll(".s3-project-open")]
        .find((c) => c.innerText.includes("3D验收"))
        .click();
      await settle();
      await click("正面");
      await click("保存工程");
    }
    if (phase === "finish") {
      check(!document.querySelector(".s3-error"), "no app error");
      check(audit.errors.length === 0, "no runtime exceptions");
      const result = {
        status: "PASS",
        checks: audit.checks,
        errors: audit.errors,
        files: audit.files.map((f) => ({ name: f.name, bytes: f.bytes })),
        supplierCalls: 0,
      };
      await collect(
        "browser-result.json",
        new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        }),
      );
      return result;
    }
    return { phase, checks: audit.checks, errors: audit.errors };
  };
  return "STUDIO3D_BROWSER_AUDIT_READY";
})();
