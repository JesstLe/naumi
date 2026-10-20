import type {PublicModelPhase} from "../agent/model-activity";
export type AssistantLiveActivity={phase:PublicModelPhase|"connecting";lastEventAt?:number};
export function receiveAssistantActivity(previous:AssistantLiveActivity,event:string,data:Record<string,unknown>,now:number):AssistantLiveActivity {
  const phase=event==="activity"&&["processing","thinking","responding"].includes(String(data.phase))?data.phase as PublicModelPhase
    : event==="open"?"processing":event==="delta"&&typeof data.text==="string"&&data.text?"responding":previous.phase;
  return {phase,lastEventAt:now};
}
/** Time changes the waiting explanation, never invents completed tool steps. */
export function assistantLivePresentation(activity:AssistantLiveActivity|undefined,elapsed:number,now:number,english=false) {
  const phase=activity?.phase||"processing",seen=activity?.lastEventAt;
  const fresh=typeof seen==="number"&&now>=seen&&now-seen<=15000;
  const quiet=typeof seen==="number"&&now-seen>15000;
  const title=phase==="connecting"?(english?"Connecting":"正在连接")
    :phase==="thinking"?(english?"Thinking":"正在思考")
    :phase==="responding"?(english?"Replying":"正在回复")
    :english?"Working on your request":"正在处理你的请求";
  const detail=quiet?(english?"No new status received recently. You can wait or stop this turn.":"暂未收到新状态，可以继续等待或停止本轮。")
    :phase==="responding"?(english?"New text appears as it arrives.":"正文正在逐段显示。")
    :elapsed>=45000?(english?"This response is taking longer. You can wait or stop this turn.":"这次响应较慢，可以继续等待或停止本轮。")
    :elapsed>=15000?(english?"The first part will appear as soon as it arrives.":"首段回复还未返回，收到后会立即显示。")
    :english?"The reply will appear here as it arrives.":"回复返回后会在这里逐段显示。";
  return {title,detail,fresh,quiet};
}
