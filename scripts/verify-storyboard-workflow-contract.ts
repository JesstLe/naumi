import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {validateVideoWorkflow} from "../src/lib/video/workflow";
import {canvasWorkflowSchema} from "../src/lib/video/canvas-workflow";

const base={id:randomUUID(),projectKey:"tree:fixture",nodes:[{id:"a",request:{prompt:"first"},dependsOn:[]},{id:"b",request:{prompt:"second"},dependsOn:["a"]}]};let checks=0;
function reject(value:unknown){assert.throws(()=>validateVideoWorkflow(value));checks++;}
assert.deepEqual(JSON.parse(JSON.stringify(validateVideoWorkflow(base))),base);checks++;
assert.deepEqual(validateVideoWorkflow({...base,assembly:{nodeIds:['b','a']}}).assembly?.nodeIds,['b','a']);checks++;
for(const nodeIds of [['a'],['a','a'],['a','foreign'],['a','b','a']])reject({...base,assembly:{nodeIds}});
reject({...base,nodes:[base.nodes[0],{...base.nodes[1],existingArtworkId:'existing'}]});
assert.equal(validateVideoWorkflow({...base,nodes:[{...base.nodes[0],existingArtworkId:'existing'},base.nodes[1]]}).nodes[0].existingArtworkId,'existing');checks++;
reject({...base,nodes:[{...base.nodes[0],dependsOn:['b']},base.nodes[1]]});
const intent={id:base.id,projectKey:base.projectKey,nodes:[{id:'a',revision:1,reuseCompleted:true},{id:'b',revision:2}],assembly:{nodeIds:['b','a']}};
assert.deepEqual(canvasWorkflowSchema.parse(intent),intent);checks++;
assert.throws(()=>canvasWorkflowSchema.parse({...intent,nodes:[{id:'a',revision:1,reuseCompleted:'yes'}]}));checks++;
assert.throws(()=>canvasWorkflowSchema.parse({...intent,assembly:{nodeIds:['a']}}));checks++;
console.log(`STORYBOARD_WORKFLOW_CONTRACT=PASS CHECKS=${checks} LEGACY=UNCHANGED ORDER=EXPLICIT CYCLES=REJECTED NETWORK=0`);
