/* Shared document boundary: paths/storage/models vary; page behavior does not. */
(function () {
  'use strict';
  const native = Boolean(window.__NAUMI_WORKBENCH__);
  const desktop = native && Boolean(window.__NAUMI_WORKBENCH__.desktop);
  const canonical = native ? '/api/reference-workbench/' : '/api/';
  const apiBase = (desktop ? '/desktop' : '') + canonical;
  const pageBase = native ? (desktop ? '/desktop' : '') + '/batchshot/native/' : '/';
  const environment = window.WorkbenchEnvironment = {
    api: action => apiBase + action,
    storage: () => native ? window.NaumiWorkbenchStorage : window.localStorage,
    models: select => { if (native) window.NaumiWorkbenchModels(select); else select.disabled = true; },
    signIn: () => native ? '/sign-in' : '/login',
    home: () => location.origin + (native ? (desktop ? '/desktop' : '') + '/batchshot' : location.pathname),
    isImagePath: pathname => pathname === canonical + 'image' || pathname === apiBase + 'image',
    // Keep persisted IndexedDB keys and names stable, including desktop's old
    // canonical image key. Native fetch already scopes the eventual request.
    historyImagePath: () => canonical + 'image',
    historyDatabase: identity => (native ? 'naumi-' : '') + 'reference-workbench-history-v1-' + identity,
  };
  function navigation() {
    document.querySelectorAll('[data-workbench-view]').forEach(link => {
      const view = link.dataset.workbenchView;
      link.href = view === 'admin' ? (native ? '/admin/model-management' : '/admin') : pageBase + view;
    });
    const link = document.querySelector('.lanLinkText');
    if (link) link.textContent = '本站链接：' + environment.home();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', navigation, {once: true});
  else navigation();
})();
