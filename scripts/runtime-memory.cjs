'use strict';

// Opt-in process-local libvips limits. Heap, allocator and job-lane budgets belong
// to deployment configuration, not application defaults or persisted settings.
const enabled = process.env.NAUMI_NATIVE_MEMORY_PROFILE === 'bounded';
let sharpReport = null;
if (enabled) {
  const sharp = require('sharp');
  sharp.cache({ memory: 32, items: 64, files: 0 });
  sharp.concurrency(1);
  const cache = sharp.cache();
  sharpReport = Object.freeze({
    cache: Object.freeze({ memory: cache.memory.max, items: cache.items.max, files: cache.files.max }),
    concurrency: sharp.concurrency(),
  });
}

module.exports = Object.freeze({
  enabled,
  profile: enabled ? 'bounded' : 'default',
  sharp: sharpReport,
});
