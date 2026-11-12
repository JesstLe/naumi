const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),esbuild=require('esbuild');
const compiled=esbuild.transformSync(fs.readFileSync('src/lib/public-release-notes.ts','utf8'),{loader:'ts',format:'cjs'}).code;
const context={module:{exports:{}},exports:{}};vm.runInNewContext(compiled,context);
const {validatePublicReleaseNotes}=context.module.exports;
const note=(zh,en='Improved the interface.')=>[{version:'1794453713',title:{zh:'使用体验更新',en:'Experience update'},improvements:[{zh,en}],fixes:[]}];
let checks=0;
assert.equal(validatePublicReleaseNotes(note('优化账户页面的使用体验。','Improved account pages.')).length,1);checks++;
assert.equal(validatePublicReleaseNotes(note('统一创作界面的导航与布局，优化模板、工具、作品及账户页面的使用体验；无限画布和原生参考工作台保持原样。')).length,1);checks++;
for(const value of ['账户标识','账号信息','供应商配置','密钥内容','user@example.com','13800138000','192.168.1.1','account owner','account pages user@example.com','账户页面 192.168.1.1','账户页面 密钥','account pages secret','https://example.com','C:/private/file','后台入口']){assert.throws(()=>validatePublicReleaseNotes(note(value)));checks++;}
console.log('PUBLIC_NOTE_UI_TERMS=PASS checks='+checks+' sensitive_terms_still_rejected=true');
