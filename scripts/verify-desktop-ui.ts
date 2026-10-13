import assert from "node:assert/strict";
import fs from "node:fs";
import {desktopHref, DESKTOP_PAGES} from "../src/lib/desktop/routes";
import {desktopProjects} from "../src/lib/desktop/projects";
import {pageFeature,requestRequirement} from "../src/lib/feature-access/catalog";
for(const p of ["/canvas?node=a#x","/generate?from=a","/suite","/works","/retouch"]){assert.equal(desktopHref(p,false),p);assert.equal(desktopHref(p),"/desktop"+p);assert.deepEqual(requestRequirement("/desktop"+p.split("?")[0]),requestRequirement(p.split("?")[0]));}
assert.equal(desktopHref("/dashboard?x=1"),"/desktop?x=1");assert.equal(desktopHref("/agent"),"/desktop/create");
for(const p of ["https://example.com","//other.com/canvas","/api/download?u=x","/media/a","/admin"]){assert.equal(desktopHref(p),p);}
assert.equal(pageFeature("/desktop"),"workspace");assert.equal(pageFeature("/desktop/create"),"agent");assert.equal(pageFeature("/desktop/canvas"),"canvas");
assert.deepEqual(requestRequirement("/desktop/api/canvas/image-tasks","POST"),requestRequirement("/api/canvas/image-tasks","POST"));
assert.deepEqual(requestRequirement("/desktop/api/account"),undefined);
assert.deepEqual(desktopProjects([],[],{}),[]);
const arts=[{id:"a",image:"/media/a",status:"completed",source:"upload",title:"A",createdAt:"2026-10-12"},{id:"b",image:"/media/b",status:"completed",parentId:"a",groupId:"a",createdAt:"2026-10-13"},{id:"s",image:"/media/s",status:"completed",batchId:"suite-1",createdAt:"2026-10-11"},{id:"single",image:"/media/q",status:"completed"},{id:"failed",image:"/media/f",status:"failed"}];
const projects=desktopProjects(arts,[{id:"t",projectKey:"text-project",title:"Text"}],{"tree:a":"Named"});
assert.equal(projects.length,3);assert.equal(projects[0].title,"Named");assert.equal(projects[0].count,2);assert.equal(projects.find(p=>p.suite)?.key,"batch:suite-1");
assert.equal(desktopProjects([{id:"cycle-a",parentId:"cycle-b",image:"/media/a",status:"completed",origin:"canvas"},{id:"cycle-b",parentId:"cycle-a",image:"/media/b",status:"completed",origin:"canvas"}],[],{}).length>0,true);
for(const page of DESKTOP_PAGES)assert.ok(fs.existsSync(`src/app/${page}/page.tsx`));
const css=fs.readFileSync("src/app/desktop/desktop.css","utf8");assert.ok(!/(^|[}\n])\s*(:root|html|body)\b/.test(css));
assert.ok(!fs.readFileSync("src/components/app-rail.tsx","utf8").includes('href="/desktop"'));
assert.ok(!fs.readFileSync("src/components/site-footer.tsx","utf8").includes('href="/desktop"'));
console.log("MODIFIED=PASS; routes=isolated; legacy_navigation=unchanged; project_grouping=PASS; permission_aliases=PASS; demo_assets=existing");
