import type {CanvasPrimaryTool} from "./view-controls";

export type CanvasKeyboardState={
  readOnly:boolean;browsing:boolean;blocked:boolean;busy:boolean;tool:CanvasPrimaryTool;
  selectedId:string|null;selectedTextId:string|null;selectedEdge:boolean;selectedGenerating:boolean;multiSel:string[];mediaCopyIntent:boolean;
};
export type CanvasKeyboardInput=CanvasKeyboardState&{
  key:string;code:string;mod:boolean;alt:boolean;shift:boolean;repeat:boolean;composing:boolean;defaultPrevented:boolean;tag:string;editable:boolean;
};
export type CanvasKeyboardAction=
  |{kind:"tool";tool:CanvasPrimaryTool}|{kind:"add-text"}|{kind:"copy"}|{kind:"paste-media"}
  |{kind:"undo"}|{kind:"redo"}|{kind:"zoom-in"}|{kind:"zoom-out"}|{kind:"fit"}
  |{kind:"cut-edge"}|{kind:"remove";ids:string[]}|{kind:"remove-text";id:string}|{kind:"clear"};
export type CanvasKeyboardDecision={prevent:boolean;action?:CanvasKeyboardAction};

/** Input ownership and command choice only. No document writes, paid actions,
 * browser globals, React state or asynchronous work belong to this decision. */
export function canvasKeyboardCommand(input:CanvasKeyboardInput):CanvasKeyboardDecision{
  const s=input,key=s.key.toLowerCase();
  if(s.defaultPrevented||s.composing||s.blocked||s.tag==="INPUT"||s.tag==="TEXTAREA"||s.tag==="SELECT"||s.editable)
    return {prevent:!s.browsing&&key==="backspace"&&!s.composing&&s.tag!=="SELECT"&&!s.editable};
  if(s.busy&&((s.mod&&(key==="z"||key==="y"))||key==="delete"||key==="backspace"))return {prevent:true};
  if(!s.mod&&!s.alt&&!s.shift&&!s.readOnly&&!s.browsing){
    const tool=key==="v"?"move":key==="m"?"marquee":key==="h"?"hand":null;
    if(tool)return {prevent:true,action:{kind:"tool",tool}};
  }
  if(s.shift&&!s.mod&&!s.alt&&s.code==="KeyT"&&!s.readOnly&&!s.browsing)return {prevent:true,action:{kind:"add-text"}};
  if(s.mod&&key==="c")return {prevent:false,action:{kind:"copy"}};
  if(s.mod&&key==="v"&&(s.tag==="VIDEO"||s.tag==="AUDIO")&&s.mediaCopyIntent)return {prevent:true,action:{kind:"paste-media"}};
  if(s.mod&&(key==="z"||key==="y"))return s.readOnly?{prevent:false}:{prevent:true,action:{kind:key==="y"||s.shift?"redo":"undo"}};
  if(s.mod&&["+","=","add"].includes(key))return {prevent:true,action:{kind:"zoom-in"}};
  if(s.mod&&["-","_","subtract"].includes(key))return {prevent:true,action:{kind:"zoom-out"}};
  if(s.mod&&key==="0")return {prevent:true,action:{kind:"fit"}};
  if(s.key==="Delete"||s.key==="Backspace"){
    const prevent=!s.browsing;
    if(s.readOnly||s.repeat)return {prevent};
    if(s.selectedEdge)return {prevent:true,action:{kind:"cut-edge"}};
    if(s.selectedGenerating)return {prevent};
    const real=s.multiSel.filter(id=>!id.startsWith("pend-")&&!id.startsWith("task-"));
    if(real.length)return {prevent:true,action:{kind:"remove",ids:real}};
    if(s.selectedId)return {prevent:true,action:{kind:"remove",ids:[s.selectedId]}};
    if(s.selectedTextId)return {prevent:true,action:{kind:"remove-text",id:s.selectedTextId}};
    return {prevent};
  }
  if(s.key==="Escape"&&s.tool!=="move")return {prevent:true,action:{kind:"clear"}};
  return {prevent:false};
}
