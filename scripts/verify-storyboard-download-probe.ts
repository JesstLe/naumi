import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {mediaDownloadHref} from '../src/lib/media/download-href';

const file='src/components/canvas/video/storyboard-panel.tsx';
const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let download:ts.JsxElement|undefined;
function visit(node:ts.Node){
 if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='a'&&node.children.some(child=>ts.isJsxExpression(child)&&child.expression?.getText(source).includes('"Download final video"')))download=node;
 ts.forEachChild(node,visit);
}
visit(source);assert.ok(download,'Existing final-video download action must remain');
const href=download.openingElement.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(source)==='href');
if(!href||!ts.isJsxAttribute(href)||!href.initializer||!ts.isJsxExpression(href.initializer)||!href.initializer.expression||!ts.isCallExpression(href.initializer.expression)||href.initializer.expression.expression.getText(source)!=='mediaDownloadHref'){
 console.log('STORYBOARD_DOWNLOAD=FAIL DIRECT_MEDIA_LINK');process.exitCode=1;
}else{
 const call=href.initializer.expression;assert.equal(call.arguments[0].getText(source),'output.url');assert.equal(call.arguments[1].getText(source),'output.name||"storyboard.mp4"');
 assert.ok(source.statements.some(s=>ts.isImportDeclaration(s)&&s.moduleSpecifier.getText(source)==='"@/lib/media/download-href"'));
 const original='https://storage.fixture/media/final.mp4?fixture-signature=example&v=2',name='storyboard.mp4',url=new URL(mediaDownloadHref(original,name),'https://app.fixture');
 assert.equal(url.origin,'https://app.fixture');assert.equal(url.pathname,'/api/download');assert.equal(url.searchParams.get('u'),original);assert.equal(url.searchParams.get('n'),name);
 console.log('STORYBOARD_DOWNLOAD=PASS OWNED_ROUTE=/api/download ORIGINAL_URL_AND_NAME=EXACT');
}
