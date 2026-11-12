const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');

const option = name => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const root = path.resolve(option('--source') || process.cwd());
const baseline = process.argv.includes('--baseline');
const raw = JSON.parse(fs.readFileSync(path.join(root, 'src/content/public-release-notes.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'src/lib/public-release-notes.ts'), 'utf8');
const context = { module: { exports: {} }, exports: {} };
vm.runInNewContext(esbuild.transformSync(source, { loader: 'ts', format: 'cjs' }).code, context);
const { validatePublicReleaseNotes: validate, publicNotesForVersion: filter } = context.module.exports;
const notes = validate(raw);
const excluded = /视频|短片|成片|分镜|审片|剪辑|字幕|配音|转写|录音|多轨|\bvideo\b|storyboard|timecode|footage|narration|transcri|subtitles?|dubbing|multi[- ]?track|audio editing/i;
const hits = notes.filter(n => excluded.test(JSON.stringify(n)));
let checks = 0;
const check = predicate => { assert.ok(predicate); checks++; };
check(notes.length > 0);
check(notes.every(n => n.improvements.length + n.fixes.length > 0));
const sample = {
  version: '1794453713', title: { zh: '使用体验更新', en: 'Experience update' },
  improvements: [{ zh: '优化图片查看体验。', en: 'Improved image viewing.' }], fixes: [],
};
if (baseline) {
  check(hits.length > 0);
  check(validate([{ ...sample, title: { zh: '视频创作更新', en: 'Video creation update' } }]).length === 1);
} else {
  check(hits.length === 0);
  for (const term of ['视频', '成片', '分镜', '审片', '剪辑', '字幕', '配音', '录音', '多轨', 'Video', 'storyboard', 'footage', 'narration', 'subtitles', 'multi-track', 'audio editing']) {
    for (const locale of ['zh', 'en']) {
      for (const field of ['title', 'improvements', 'fixes']) {
        const bad = JSON.parse(JSON.stringify(sample));
        if (field === 'title') bad.title[locale] = term;
        else bad[field] = [{ ...sample.improvements[0], [locale]: term }];
        assert.throws(() => validate([bad])); checks++;
      }
    }
  }
  for (const version of ['1794327098', '1794310315', '1793620641', '1792696653']) {
    check(!notes.some(n => n.version === version));
  }
  check(notes.find(n => n.version === '1794396691').fixes.some(n => n.zh === '修复部分图片比例选项缺失的问题。'));
  check(notes.find(n => n.version === '1793164841').improvements.some(n => n.zh.includes('原节点重新生成')));
  check(notes.some(n => n.improvements.some(t => t.zh.includes('原生参考工作台保持原样'))));
  for (const term of ['供应商', '密钥', '47.105.59.142', 'staff@example.test']) {
    assert.throws(() => validate([{ ...sample, title: { zh: term, en: 'Update' } }])); checks++;
  }
  const requested = notes.at(-1).version;
  check(filter(notes, requested, notes[0].version).every(n => Number(n.version) <= Number(requested)));
  check(filter(notes, notes[0].version, notes[0].version).length === notes.length);
  const version = option('--version');
  if (version) check(notes.some(n => n.version === version));
}
console.log('PUBLIC_NOTE_CONTENT=' + JSON.stringify({ mode: baseline ? 'BASELINE' : 'MODIFIED', records: notes.length, videoRelatedRecords: hits.length, checks, failed: 0 }));
