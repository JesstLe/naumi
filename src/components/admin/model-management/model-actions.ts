import type { ManagedModelRow } from "@/lib/model-config/management";
import type { MappingAction } from "./model-mapping-card";
import type { EditorState } from "./editor-state";

/** UI actions only. Server validation, publication identity and drafts remain in their owners. */
export function modelActions(row: ManagedModelRow, managed: boolean, locked: boolean, open: (editor: EditorState) => void): MappingAction[] {
  const disabled = locked || !managed;
  const actions: MappingAction[] = [
    { label: "名称与公开 ID", group: "display", disabled, onClick: () => open({kind:"rename",row}) },
    { label: "设置积分", group: "display", disabled: disabled || !row.features.length, onClick: () => open({kind:"price",row}) },
    { label: row.modality === "image" ? "更换模型" : "更换通道 / 模型", group: "routing", disabled, onClick: () => open({kind:"switch",row,initialProvider:row.routes[0]?.providerId || ""}) },
  ];
  if (row.channelsEditable) actions.push({label:"供应通道",group:"routing",disabled,onClick:()=>open({kind:"channels",row,draft:null})});
  if (row.modality === "video") actions.push({label:"视频能力",group:"parameters",disabled:disabled || !row.videoConfig?.routes.length,onClick:()=>open({kind:"video",row})});
  if (row.modality === "image") actions.push(
    {label:"统一参数映射",group:"parameters",disabled:disabled || row.preset || !row.parameterSources?.length || !row.resolutionConfig?.routes.every(route=>route.editable) || !row.qualityConfig?.routes.every(route=>route.editable),onClick:()=>open({kind:"mapping",row})},
    {label:"显示档位与上游质量",group:"parameters",disabled,title:row.preset?"默认预设管理参数":"配置显示档位与实际传参",onClick:()=>open({kind:"parameters",row})},
    {label:"分辨率设置",group:"parameters",disabled,onClick:()=>open({kind:"resolution",row})},
  );
  if (row.modality === "image" && managed) actions.push({label:"图像高级参数",group:"parameters",disabled:locked,onClick:()=>open({kind:"advanced",row})});
  return actions;
}
