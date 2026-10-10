import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root=path.resolve(process.argv[2] || ".");
const read=(base,file)=>fs.readFileSync(path.join(base,file),"utf8").replace(/\r\n/g,"\n");
const keys=["addTextHint","addImageNodeHint","uploadHint","historyHint","editTextHint","expandHint","annotateHint","bgHint","cutoutHint","hdHint","ratioHint","relightHint","angleHint","captionHint","workflowHint","videoHint","assistantHint","renameHint","fillImageHint"];
function dictionaries(source){
 const ast=ts.createSourceFile("dict.ts",source,99,true,3),found={};
 function value(n){if(ts.isObjectLiteralExpression(n))return Object.fromEntries(n.properties.filter(ts.isPropertyAssignment).map(p=>[p.name.getText(ast).replace(/^['"]|['"]$/g,""),value(p.initializer)]));if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;return n.getText(ast);}
 function walk(n){if(ts.isVariableDeclaration(n)&&["zh","en"].includes(n.name.getText(ast)))found[n.name.getText(ast)]=value(n.initializer);ts.forEachChild(n,walk);}walk(ast);return found;
}
const file="src/lib/i18n/dict.ts",dict=dictionaries(read(root,file));
if(process.argv.includes("--baseline")){
 assert.ok(dict.zh.canvas.toolbar.cutoutHint.includes("不重新绘制"));assert.ok(dict.zh.canvas.toolbar.hdHint.length>30);
 console.log("BASELINE=PASS VERBOSE_HINTS=REPRODUCED CUTOUT=移除背景并输出透明底图片，不重新绘制主体");process.exit(0);
}
for(const locale of ["zh","en"])for(const key of keys){const v=dict[locale].canvas.toolbar[key];assert.equal(typeof v,"string");assert.ok(v.length<=(locale==="zh"?24:48),locale+" "+key);assert.ok(!/不是|不会|不重新|不修改|不改|not |without |does not/i.test(v),v);}
assert.equal(dict.zh.canvas.toolbar.cutoutHint,"移除背景，输出透明图");
const i=process.argv.indexOf("--business-baseline");
if(i>=0){
 const base=path.resolve(process.argv[i+1]),before=dictionaries(read(base,file));
 for(const locale of ["zh","en"])for(const key of keys)before[locale].canvas.toolbar[key]=dict[locale].canvas.toolbar[key];assert.deepEqual(dict,before,"Only toolbar hint fields may change");
 const client="src/components/canvas/canvas-client.tsx",old=read(base,client).replace('title={L("裁剪并保存为新版本","Crop and save a new version")}','title={L("裁剪为新版本","Crop to a new version")}').replace('title={L("上传替换图并保存为新版本","Upload a replacement as a new version")}','title={L("替换为新版本","Replace with a new version")}');assert.equal(read(root,client),old,"Only crop/replace title text may change");
 console.log("BUSINESS=PASS CLIENT_EXCEPT_TWO_TITLES=IDENTICAL DICTIONARY_EXCEPT_HINTS=IDENTICAL");
}
console.log("MODIFIED=PASS HINTS=19 LOCALES=ZH_EN NEGATIVE_EXPLANATIONS=0 CUTOUT=移除背景，输出透明图");
