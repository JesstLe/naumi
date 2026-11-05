'use client';
import {createPortal} from 'react-dom';
import dynamic from 'next/dynamic';
import type {CanvasNativeNodeSet} from '@/lib/canvas/native-node-records';
import type {CanvasNativeEditorHandle,CanvasNativeEditorSnapshot} from '@/lib/canvas/native-editor-session';
import type {createCanvasReferenceAssetActions} from '@/lib/canvas/reference-asset-actions';
import type {createCanvasDirectorActions} from '@/lib/canvas/director-actions';
import type {createCanvasAudioActions} from '@/lib/canvas/audio-actions';
import type {createCanvasTimelineActions} from '@/lib/canvas/timeline-actions';
import type {TimelineMaterial} from '@/lib/canvas/timeline-node-schema';
import type {VideoInputChoice} from '@/lib/video/input-choice';
import type {useMediaJobs} from './video/use-media-jobs';

const loading=()=> <div role="status" className="p-4 text-sm text-slate-500">加载中…</div>;
const CharacterEditor=dynamic(()=>import('./character/character-editor').then(module=>module.CharacterEditor),{ssr:false,loading});
const SceneEditor=dynamic(()=>import('./scene/scene-editor').then(module=>module.SceneEditor),{ssr:false,loading});
const DirectorEditor=dynamic(()=>import('./director/director-editor').then(module=>module.DirectorEditor),{ssr:false,loading});
const AudioEditor=dynamic(()=>import('./audio/audio-editor').then(module=>module.AudioEditor),{ssr:false,loading});
const TimelineEditor=dynamic(()=>import('./timeline/timeline-editor').then(module=>module.TimelineEditor),{ssr:false,loading});

type ReferenceCommands<K extends 'character'|'scene'>=ReturnType<ReturnType<typeof createCanvasReferenceAssetActions<K>>['bind']>;
export type CanvasNativeEditorCommands={
  character:ReferenceCommands<'character'>;scene:ReferenceCommands<'scene'>;
  director:ReturnType<ReturnType<typeof createCanvasDirectorActions>['bind']>;
  audio:ReturnType<ReturnType<typeof createCanvasAudioActions>['bind']>;
  timeline:ReturnType<ReturnType<typeof createCanvasTimelineActions>['bind']>;
};
type Props={
  sessions:CanvasNativeEditorSnapshot;legacyDraftScope:string;
  nodes:Omit<CanvasNativeNodeSet,'videoNodes'>;commands:CanvasNativeEditorCommands;
  inputs:VideoInputChoice[];resolvedInputs:VideoInputChoice[];
  media:Pick<ReturnType<typeof useMediaJobs>,'jobs'|'cancel'|'estimate'>;
  inspectTimeline:(nodeId:string,ids:string[])=>Promise<TimelineMaterial[]>;
  english:boolean;readOnly:boolean;settingsReady:boolean;locked:(id:string)=>boolean;
};

/** Composition of the five existing editors. Concrete action owners retain
 * saves/CAS, uploads, render/adopt identities, history and paid-job recovery.
 * Callbacks may start only from their original live panel. Already-started
 * commands are not cancelled, replayed or reinterpreted when the panel closes. */
export function CanvasNativeEditors({sessions,legacyDraftScope,nodes,commands,inputs,resolvedInputs,media,inspectTimeline,english,readOnly,settingsReady,locked}:Props){
  const panels=[];
  const common=(handle:CanvasNativeEditorHandle)=>({draftScope:handle.kind==='timeline'?handle.scope.key:legacyDraftScope,english,
    readOnly:readOnly||!settingsReady||locked(handle.id),onClose:handle.close});
  const images=inputs.filter(choice=>choice.kind==='image');
  const guard=<A extends unknown[],R,>(handle:CanvasNativeEditorHandle,action:(...args:A)=>R)=>(...args:A):R=>{handle.assertCurrent();return action(...args);};
  const character=sessions.character,nodeCharacter=character&&nodes.characterNodes.find(node=>node.id===character.id&&node.projectKey===character.scope.project&&!node.deletedAt);
  if(character&&character.current()&&nodeCharacter)panels.push(<CharacterEditor key={character.key} {...common(character)} node={nodeCharacter} images={images}
    onSave={guard(character,(value,revision)=>commands.character.patch(character.id,{character:value,title:value.name,expectedRevision:revision}))}
    onUpload={guard(character,files=>commands.character.upload(character.id,files))}
    onGenerate={guard(character,(value,appearance)=>commands.character.reference(character.id,value,appearance))}/>);
  const timeline=sessions.timeline,nodeTimeline=timeline&&nodes.timelineNodes.find(node=>node.id===timeline.id&&node.projectKey===timeline.scope.project&&!node.deletedAt);
  if(timeline&&timeline.current()&&nodeTimeline)panels.push(<TimelineEditor key={timeline.key} {...common(timeline)} node={nodeTimeline} choices={inputs.filter(choice=>choice.kind!=='text')} jobs={media.jobs}
    onSave={guard(timeline,(value,revision)=>commands.timeline.patch(timeline.id,{timeline:value,expectedRevision:revision}))}
    onInspect={guard(timeline,ids=>inspectTimeline(timeline.id,ids))} onUpload={guard(timeline,files=>commands.timeline.upload(timeline.id,files))}
    onRender={guard(timeline,revision=>commands.timeline.render(timeline.id,revision))} onCancel={guard(timeline,media.cancel)}
    onAdopt={guard(timeline,job=>commands.timeline.adopt(timeline.id,job))} onQuote={guard(timeline,()=>media.estimate('ffmpeg'))}/>);
  const audio=sessions.audio,nodeAudio=audio&&nodes.audioNodes.find(node=>node.id===audio.id&&node.projectKey===audio.scope.project&&!node.deletedAt);
  if(audio&&audio.current()&&nodeAudio)panels.push(<AudioEditor key={audio.key} {...common(audio)} node={nodeAudio} sources={inputs.filter(choice=>choice.kind==='audio')} jobs={media.jobs}
    onSave={guard(audio,(value,revision)=>commands.audio.patch(audio.id,{audio:value,expectedRevision:revision}))}
    onUpload={guard(audio,files=>commands.audio.upload(audio.id,files))} onRender={guard(audio,revision=>commands.audio.render(audio.id,revision))}
    onCancel={guard(audio,media.cancel)} onAdopt={guard(audio,job=>commands.audio.adopt(audio.id,job))} onQuote={guard(audio,()=>media.estimate('ffmpeg'))}/>);
  const scene=sessions.scene,nodeScene=scene&&nodes.sceneNodes.find(node=>node.id===scene.id&&node.projectKey===scene.scope.project&&!node.deletedAt);
  if(scene&&scene.current()&&nodeScene)panels.push(<SceneEditor key={scene.key} {...common(scene)} node={nodeScene} images={images}
    onSave={guard(scene,(value,revision)=>commands.scene.patch(scene.id,{scene:value,title:value.name,expectedRevision:revision}))}
    onUpload={guard(scene,files=>commands.scene.upload(scene.id,files))}
    onGenerate={guard(scene,(value,state)=>commands.scene.reference(scene.id,value,state))}/>);
  const director=sessions.director,nodeDirector=director&&nodes.directorNodes.find(node=>node.id===director.id&&node.projectKey===director.scope.project&&!node.deletedAt);
  if(director&&director.current()&&nodeDirector)panels.push(<DirectorEditor key={director.key} {...common(director)} node={nodeDirector}
    scenes={nodes.sceneNodes.filter(node=>node.projectKey===director.scope.project)}
    images={resolvedInputs.filter(choice=>choice.kind==='image'&&choice.available).map(choice=>({id:choice.nodeId,title:choice.title,url:choice.value}))}
    onSave={guard(director,(value,revision)=>commands.director.patch(director.id,{project:value,title:value.name,expectedRevision:revision}))}
    onOutput={guard(director,(file,kind,revision)=>commands.director.output(director.id,file,kind,revision))}/>);
  // Keep the original independent portals: existing panels retain their DOM
  // position when another kind opens; the most recently opened panel is on top.
  return panels.map(panel=>createPortal(panel,document.body,panel.key));
}
