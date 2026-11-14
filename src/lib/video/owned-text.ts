import 'server-only';
import {canvasTextContent} from '../canvas/text-content';
import {getPool} from '@/platform/db/pool';
import {VideoContractError} from './contract';
import {frozenWorkflowText} from './workflow-text-context';
export async function requireOwnedVideoText(email:string,id:string){
  const frozen=frozenWorkflowText(email,id);if(frozen!==undefined)return frozen;
  const row=(await getPool().query("SELECT content,prompt,status FROM app_canvas_text_nodes WHERE email=$1 AND id=$2",[email,id.replace(/^text:/,"")])).rows[0];
  if(!row)throw new VideoContractError("TEXT_REFERENCE_UNAVAILABLE","引用文字节点不存在或无权访问");
  if(["generating","processing","queued"].includes(String(row.status)))throw new VideoContractError("TEXT_DEPENDENCY_PENDING","前序文字尚未完成");
  return canvasTextContent(row);
}
