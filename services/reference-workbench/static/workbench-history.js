/* 用户本机的版本图片/提示词/模板归档；账号分库，不清除旧版本，不将失败称为已缓存。 */
(function () {
  'use strict';
  let database, identity = '', lastRoot = '', failed = false;
  const urls = new Map(), originals = new Map(), loading = new Map();
  function release() { for (const value of urls.values()) URL.revokeObjectURL(value); urls.clear(); originals.clear(); loading.clear(); if (database) database.close(); database = null; identity = ''; }
  const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  function finished(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); }); }
  async function init() {
    if (database) return;
    const response = await fetch('/api/auth/status', { cache: 'no-store' });
    if (!response.ok) throw Error('登录失效，本机缓存未读取');
    const auth = await response.json(); identity = auth.id;
    if (!identity) throw Error('账号标识缺失');
    database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('reference-workbench-history-v1-' + identity, 1);
      opening.onupgradeneeded = () => { for (const name of ['images', 'projects', 'templates']) opening.result.createObjectStore(name, { keyPath: 'key' }); };
      opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error);
    });
    database.onversionchange = () => { database.close(); database = null; };
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => false);
  }
  async function get(store, key) { await init(); return request(database.transaction(store, 'readonly').objectStore(store).get(key)); }
  async function put(store, row) { await init(); const tx = database.transaction(store, 'readwrite'), done = finished(tx); tx.objectStore(store).put(row); await done; }
  function source(url) {
    if (originals.has(url)) return originals.get(url);
    try { const parsed = new URL(url, location.href); return parsed.origin === location.origin && parsed.pathname === '/api/image' ? parsed.pathname + '?path=' + encodeURIComponent(parsed.searchParams.get('path')) : ''; } catch (_) { return ''; }
  }
  async function blob(url) {
    const key = source(url); if (!key) throw Error('图片不是当前工作台素材');
    if (loading.has(key)) return loading.get(key);
    const job = (async () => {
      const saved = await get('images', key);
      if (saved && saved.blob) return saved.blob;
      const response = await fetch(key, { cache: 'no-store' });
      if (!response.ok) throw Error('图片缓存失败：' + response.status);
      const value = await response.blob(); if (!value.type.startsWith('image/') || value.size > 32 * 1024 * 1024) throw Error('图片缓存格式或大小无效');
      const bitmap = await createImageBitmap(value); const dimensions = { width: bitmap.width, height: bitmap.height }; bitmap.close();
      await put('images', { key, blob: value, dimensions, savedAt: Date.now() }); return value;
    })().finally(() => loading.delete(key)); loading.set(key, job); return job;
  }
  async function localUrl(url) {
    const key = source(url); if (!key) return url;
    if (urls.has(key)) return urls.get(key);
    const value = await blob(url), local = URL.createObjectURL(value); urls.set(key, local); originals.set(local, key); return local;
  }
  async function remember(root, rows) {
    const check = await fetch('/api/auth/status', { cache: 'no-store' });
    if (!check.ok) { release(); throw Error('登录失效，本机历史未读取'); }
    const auth = await check.json(); if (identity && auth.id !== identity) release();
    await init(); lastRoot = root;
    const copy = JSON.parse(JSON.stringify(rows));
    const images = new Set();
    for (const item of copy) {
      images.add(item.ref_url); for (const url of item.product_urls || []) images.add(url);
      for (const version of item.versions || []) { images.add(version.url); if (version.meta && version.meta.annotated_url) images.add(version.meta.annotated_url); }
    }
    const unique = [...images].filter(Boolean);
    for (let i = 0; i < unique.length; i += 3) await Promise.all(unique.slice(i, i + 3).map(localUrl));
    const previous = await get('projects', root);
    // 即使服务器清单缩短，已经保存在本机的旧版本仍保留。
    if (previous) for (const item of copy) {
      const old = previous.items.find(x => x.ref_path === item.ref_path);
      if (old) { const versions = new Map((old.versions || []).map(v => [v.path, v])); for (const v of item.versions || []) versions.set(v.path, v); item.versions = [...versions.values()]; }
    }
    await put('projects', { key: root, items: copy, savedAt: Date.now() });
    return hydrate(copy);
  }
  function resolve(url) { return urls.get(source(url)) || url; }
  async function hydrate(rows) {
    for (const item of rows) {
      item.ref_url = await localUrl(item.ref_url);
      item.product_urls = await Promise.all((item.product_urls || [item.product_url]).map(localUrl)); item.product_url = item.product_urls[0];
      for (const v of item.versions || []) { v.original_url = v.original_url || v.url; v.local_url = await localUrl(v.url); if (v.meta && v.meta.annotated_url) v.meta.annotated_local_url = await localUrl(v.meta.annotated_url); }
    }
    return rows;
  }
  async function restore(root) { const saved = await get('projects', root); return saved ? hydrate(saved.items) : null; }
  async function download(url) { const value = await blob(url), local = URL.createObjectURL(value), a = document.createElement('a'); a.href = local; a.download = '历史版本.png'; a.click(); setTimeout(() => URL.revokeObjectURL(local), 2000); }
  function saveBlob(value, name) { const local = URL.createObjectURL(value), a = document.createElement('a'); a.href = local; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(local), 2000); }
  async function archive(imageUrls) { const zip = new JSZip(); let total = 0, number = 0; for (const url of imageUrls) { const value = await blob(url); total += value.size; if (total > 256 * 1024 * 1024) throw Error('本机打包超过256MB'); const path = new URL(source(url), location.origin).searchParams.get('path'); zip.file(String(++number).padStart(3, '0') + '_' + path.split('/').pop(), await value.arrayBuffer()); } if (!number) throw Error('没有可下载图片'); return zip.generateAsync({ type: 'blob' }); }
  async function saveTemplate(item, version) {
    const name = window.prompt('模板名称', item.product + ' ' + version.label); if (!name) return;
    const card = [...document.querySelectorAll('.card')].find(c => c.dataset.ref === item.ref_path);
    const currentPrompt = card && card.querySelector('.prompt') ? card.querySelector('.prompt').value : version.meta.prompt;
    const response = await fetch('/api/workbench/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ref_path: item.ref_path, version_path: version.path, workbench_root: currentRoot(), config: workbenchRequestConfig(), prompt: currentPrompt }) });
    const data = await response.json(); if (!response.ok) throw Error(data.detail || '模板保存失败');
    const template = data.template;
    const referenceBlob = await blob(template.reference_url), resultBlob = await blob(template.result_url);
    await put('templates', { key: template.id, template, referenceBlob, resultBlob, savedAt: Date.now() });
    status.textContent = '模板已保存到本机：' + name;
  }
  async function showTemplates() {
    await init(); const rows = await request(database.transaction('templates', 'readonly').objectStore('templates').getAll());
    modal.classList.remove('compareOpen'); modal.classList.add('open');
    modal.innerHTML = '<div class="modalBox" onclick="event.stopPropagation()" style="width:min(960px,94vw)"><h3>本机模板</h3><div id="localTemplateList"></div><button class="secondary" onclick="closeModal()">关闭</button></div>';
    const list = document.getElementById('localTemplateList');
    if (!rows.length) { list.textContent = '暂无模板，请在满意版本旁点击保存模板。'; return; }
    for (const row of rows) {
      const box = document.createElement('div'); box.className = 'projectItem';
      const label = document.createElement('strong'); label.textContent = row.template.name + ' / ' + row.template.source_version; box.append(label);
      const preview = document.createElement('img'); preview.src = await localUrl(row.template.result_url); preview.style.cssText = 'max-width:180px;max-height:160px;object-fit:contain'; box.append(preview);
      const text = document.createElement('div'); text.className = 'status'; text.textContent = row.template.prompt; box.append(text);
      const apply = document.createElement('button'); apply.textContent = '套用到当前产品'; apply.onclick = async () => {
        try { if (!currentRoot()) throw Error('请先选择当前产品文件夹');
          const response = await fetch('/api/workbench/templates/' + encodeURIComponent(row.template.id) + '/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workbench_root: currentRoot() }) });
          const data = await response.json(); if (!response.ok) throw Error(data.detail || '模板套用失败');
          setPromptOverride(data.ref_path, data.prompt); document.getElementById('mode').value = 'all_sku'; closeModal(); await loadRefs(); status.textContent = '模板参考图与提示词已套用，当前产品图保持不变。';
        } catch (e) { alert(e.message); }
      }; box.append(apply); list.append(box);
    }
  }
  window.WorkbenchHistory = { init, remember, restore, localUrl, blob, resolve, source, download, archive, saveBlob, saveTemplate, showTemplates };
  window.saveCurrentTemplate = i => { const item = items[i], version = item && activeVersion(item); if (version) saveTemplate(item, version).catch(e => { status.textContent = '模板保存失败：' + e.message; }); };
  window.openLocalTemplates = () => showTemplates().catch(e => { status.textContent = '本机模板读取失败：' + e.message; });
  window.addEventListener('pagehide', () => { for (const value of urls.values()) URL.revokeObjectURL(value); });
})();
