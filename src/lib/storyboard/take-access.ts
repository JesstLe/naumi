import 'server-only';
import type {PoolClient} from 'pg';
import {getVideoTask} from '../video/task-repository';
import {publicVideoTaskSnapshot} from '../video/task-snapshot';
import {ModelConfigError} from '../model-config/types';
import type {StoryboardTake} from './plan';
import {inheritedStoryboardTakeOrigin} from './repository';

/** A take belongs to this node, or an exact immutable inherited-take receipt; never an arbitrary owned asset. */
export async function assertStoryboardTake(actor:string,projectKey:string,nodeId:string,take:Pick<StoryboardTake,"taskId"|"artworkId">,tx?:Pick<PoolClient,"query">){
  const task=await getVideoTask(actor,take.taskId,tx),snapshot=task&&publicVideoTaskSnapshot(task);
  const origin=snapshot?.nodeId===nodeId?nodeId:await inheritedStoryboardTakeOrigin(actor,projectKey,nodeId,take,tx);
  const outputs=task?.parameters.resultAssets as Array<{artworkId:string;kind?:string;mimeType?:string}>|undefined;
  if(!task||task.status!=="completed"||!origin||snapshot?.nodeId!==origin||snapshot.projectKey!==projectKey||
    !(outputs?.some(asset=>asset.artworkId===take.artworkId&&(asset.kind==="video"||asset.mimeType?.startsWith("video/")))||task.artworkId===take.artworkId&&!!task.videoUrl))
    throw new ModelConfigError("STORYBOARD_TAKE_UNAVAILABLE","候选结果不属于此镜头，或尚未完成",422);
  return origin;
}
