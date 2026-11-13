import type {CanvasVideoNode} from './video-node-schema';
import type {PublicVideoTaskView} from '../video/queries';

/** Resolve only recorded result ownership in the current account's project.
 * Imported media and ambiguous/shared results never acquire guessed settings.
 * This is a view association, not a selection, document or task mutation. */
export function videoResultComposerNode(
  artworkId:string, project:string|null, nodes:readonly CanvasVideoNode[],
  tasks:readonly PublicVideoTaskView[],
):CanvasVideoNode|null {
  if(!project)return null;
  const owners=new Set<string>();
  for(const node of nodes){
    if(node.projectKey===project&&!node.deletedAt&&(node.lastResultId===artworkId||node.displayResultId===artworkId))owners.add(node.id);
  }
  for(const task of tasks){
    if(task.projectKey!==project||task.status!=='completed'||!(task.artworkId===artworkId||task.resultAssets?.some(asset=>asset.artworkId===artworkId)))continue;
    const id=task.nodeId||(task.source==='canvas'?task.sourceId:null);
    if(id)owners.add(id);
  }
  if(owners.size!==1)return null;
  return nodes.find(node=>owners.has(node.id)&&node.projectKey===project&&!node.deletedAt)??null;
}
