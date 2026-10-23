/*
 * Read-only worksheet projection shared by demand, task and schedule views.
 * No accounts, formal orders, acceptance records, credits or writes are created.
 * Fixed cell IDs supply display text; column labels and people names bind nothing.
 * Counts include unnamed rows; attachments count retained references, not files
 * deduplicated across rows. Group order follows first appearance, including ''.
 * Filters are AND: omitted/null means all; explicit '' matches an empty value.
 * Search uses displayed text and attachment names, capped at 120 UTF-16 units.
 * Pages start at 1 (also when empty); requested pages cap at 10000, then at the
 * last available page. Invalid sizes default to 30; positive sizes are integers.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else if (typeof define === 'function' && define.amd) define([], function () { return api; });
  root.EnterpriseRealModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const fields = ['title', 'owner', 'designer', 'status', 'schedule', 'started', 'finished', 'dispatch', 'quantity', 'taskType'];
  const exactFields = ['status', 'designer', 'owner'];
  const text = value => typeof value === 'string' ? value
    : typeof value === 'number' && Number.isFinite(value) ? String(value)
      : typeof value === 'boolean' ? String(value) : '';
  const cellsOf = row => row.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) ? row.cells : {};
  const isId = value => typeof value === 'string' && value.length > 0
    || typeof value === 'number' && Number.isFinite(value);

  function refs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(ref => ref && typeof ref === 'object' && !Array.isArray(ref)
      && (ref.kind === 'source' || ref.kind === 'worksheet')
      && typeof ref.id === 'string' && ref.id.trim() !== ''
      && typeof ref.name === 'string' && ref.name.trim() !== '')
      .map(ref => ({ name: ref.name, id: ref.id, kind: ref.kind }));
  }

  function project(document) {
    const active = (document && Array.isArray(document.rows) ? document.rows : [])
      .filter(row => row && typeof row === 'object' && !Array.isArray(row) && !row.archived);
    const byId = new Map(), duplicates = new Set();
    for (const row of active) {
      if (byId.has(row.id)) duplicates.add(row.id);
      byId.set(row.id, row);
    }

    // A candidate ID or parentText alone is never a relationship. Deleted,
    // ambiguous IDs, self-links and cyclic confirmed chains stay standalone.
    const parents = new Map(), validity = new Map();
    for (const row of active) {
      const parent = byId.get(row.parentId);
      if (row.parentConfirmed === true && isId(row.parentId)
        && parent && parent !== row && parent.id !== row.id && !duplicates.has(row.parentId)) {
        parents.set(row, parent);
      }
    }
    function validChain(row) {
      const path = [], seen = new Set();
      let cursor = row;
      while (parents.has(cursor) && !validity.has(cursor) && !seen.has(cursor)) {
        path.push(cursor);
        seen.add(cursor);
        cursor = parents.get(cursor);
      }
      const valid = !seen.has(cursor) && validity.get(cursor) !== false;
      for (const item of path) validity.set(item, valid);
      return validity.get(row) !== false;
    }

    const rows = active.map(row => {
      const cells = cellsOf(row), parent = validChain(row) ? parents.get(row) : null;
      const result = { id: row.id };
      for (const field of fields) result[field] = text(cells[field]);
      return Object.assign(result, {
        originRow: row.originRow == null ? null : row.originRow,
        parentId: parent ? parent.id : null,
        parentTitle: parent ? text(cellsOf(parent).title) : '',
        parentConfirmed: Boolean(parent),
        hasUnconfirmedParent: !parent && (row.parentId != null && row.parentId !== ''
          || text(cells.parentText).trim() !== '' || row.parentConfirmed === true),
        images: refs(cells.image),
        files: refs(cells.files)
      });
    });

    const counts = { records: rows.length, named: 0, completed: 0, inProgress: 0, notStarted: 0, unknown: 0, assigned: 0, unassigned: 0, attachments: 0 };
    const statuses = new Map(), designers = new Map();
    for (const row of rows) {
      if (row.title.trim()) counts.named++;
      if (row.status === '已完成') counts.completed++;
      else if (row.status === '进行中') counts.inProgress++;
      else if (row.status === '未开始') counts.notStarted++;
      else counts.unknown++;
      if (row.designer.trim()) counts.assigned++;
      else counts.unassigned++;
      counts.attachments += row.images.length + row.files.length;
      if (!statuses.has(row.status)) statuses.set(row.status, { status: row.status, count: 0 });
      statuses.get(row.status).count++;
      if (!designers.has(row.designer)) designers.set(row.designer, { name: row.designer, count: 0, completed: 0, inProgress: 0 });
      const designer = designers.get(row.designer);
      designer.count++;
      if (row.status === '已完成') designer.completed++;
      if (row.status === '进行中') designer.inProgress++;
    }
    return { rows, counts, statusCounts: [...statuses.values()], designerCounts: [...designers.values()] };
  }

  function filter(rows, options) {
    const settings = options || {}, query = text(settings.query).trim().slice(0, 120).toLowerCase();
    return (Array.isArray(rows) ? rows : []).filter(row => {
      if (!row) return false;
      if (!exactFields.every(field => settings[field] == null || row[field] === text(settings[field]))) return false;
      if (!query) return true;
      const values = fields.map(field => row[field]).concat(row.id, row.originRow, row.parentTitle);
      for (const field of ['images', 'files']) {
        if (Array.isArray(row[field])) for (const ref of row[field]) values.push(ref && ref.name);
      }
      return values.some(value => text(value).toLowerCase().includes(query));
    });
  }

  function page(rows, requestedPage, requestedSize = 30) {
    const source = Array.isArray(rows) ? rows : [];
    const sizeNumber = Number(requestedSize), pageNumber = Number(requestedPage);
    const size = Number.isFinite(sizeNumber) && Math.trunc(sizeNumber) > 0 ? Math.trunc(sizeNumber) : 30;
    const total = source.length, pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(pages, 10000, Math.max(1, Number.isNaN(pageNumber) ? 1 : Math.trunc(pageNumber)));
    return { rows: source.slice((current - 1) * size, current * size), total, page: current, pages, size };
  }

  return Object.freeze({ project, filter, page });
});
