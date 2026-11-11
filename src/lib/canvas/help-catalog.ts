export type HelpPlatform = "windows" | "mac";
type HelpText = { zh: string; en: string };
const text = (zh: string, en: string): HelpText => ({ zh, en });

export type HelpShortcut = {
  id: string;
  label: HelpText;
  keys: string[][];
};
export type HelpSection = {
  id: string;
  title: HelpText;
  shortcuts: HelpShortcut[];
};

/** Mirrors canvas-client's actual key handler and React Flow input configuration. */
export function canvasHelpSections(platform: HelpPlatform): HelpSection[] {
  const mod = platform === "mac" ? "⌘" : "Ctrl";
  return [
    {
      id: "navigation", title: text("画布导航", "Navigation"), shortcuts: [
        { id: "move", label: text("选择 / 移动节点，拖空白框选", "Select / move nodes; drag blank space to select"), keys: [["V"]] },
        { id: "hand", label: text("手型工具：只平移画布", "Hand tool: pan canvas only"), keys: [["H"]] },
        { id: "pan", label: text("临时平移", "Temporary pan"), keys: [["Space", "Drag"]] },
        { id: "zoom", label: text("缩放画布", "Zoom canvas"), keys: [[mod, "Wheel"]] },
        { id: "zoom-in", label: text("放大", "Zoom in"), keys: [[mod, "+"]] },
        { id: "zoom-out", label: text("缩小", "Zoom out"), keys: [[mod, "−"]] },
        { id: "fit", label: text("适合屏幕", "Fit to view"), keys: [[mod, "0"]] },
      ],
    },
    {
      id: "selection", title: text("选择与编辑", "Selection & editing"), shortcuts: [
        { id: "marquee", label: text("框选工具", "Box select tool"), keys: [["M"]] },
        { id: "box-select", label: text("选择模式兼容 Shift 框选", "Shift box selection in select mode"), keys: [["Shift", "Drag"]] },
        { id: "multi-select", label: text("增选 / 取消选择", "Add / remove selection"), keys: [["Shift", "Click"]] },
        { id: "save", label: text("保存画布", "Save canvas"), keys: [[mod, "S"]] },
        { id: "undo", label: text("撤销", "Undo"), keys: [[mod, "Z"]] },
        { id: "redo", label: text("重做", "Redo"), keys: platform === "mac" ? [["Shift", mod, "Z"]] : [[mod, "Y"]] },
        { id: "delete", label: text("删除选中节点或连线", "Delete selected nodes or edge"), keys: platform === "mac" ? [["⌫"], ["Fn", "⌫"]] : [["Delete"], ["Backspace"]] },
        { id: "exit-tool", label: text("退出框选 / 手型", "Exit box select / hand tool"), keys: [["Esc"]] },
      ],
    },
    {
      id: "creation", title: text("创建与导入", "Create & import"), shortcuts: [
        { id: "add-text", label: text("新建文字节点", "New text node"), keys: [["Shift", "T"]] },
        { id: "copy", label: text("复制媒体节点", "Copy media node"), keys: [[mod, "C"]] },
        { id: "paste", label: text("粘贴节点、工作流或图片", "Paste node, workflow or image"), keys: [[mod, "V"]] },
        { id: "text-generate", label: text("文字提示框内生成", "Generate from text prompt"), keys: [[mod, "Enter"]] },
      ],
    },
  ];
}

export const canvasHelpGuides = [
  { id: "node-menu", title: text("节点操作", "Node actions"), description: text("右键图片或文字节点，打开操作菜单。", "Right-click an image or text node for its actions.") },
  { id: "connection", title: text("连接节点", "Connect nodes"), description: text("从节点右侧的 + 拖到空白处，创建衍生节点。", "Drag the + on a node to empty space to create a linked node.") },
  { id: "import", title: text("导入素材", "Import media"), description: text("拖入图片，或在空白处右键上传、从历史选择。", "Drop images, or right-click empty space to upload or choose from history.") },
  { id: "batch", title: text("批量操作", "Batch actions"), description: text("框选多个节点，在浮动工具栏操作。", "Select multiple nodes to use the floating batch toolbar.") },
  { id: "assistant", title: text("画布 Agent", "Canvas Agent"), description: text("点击 Agent 入口或悬浮小球，打开侧栏。", "Open the sidebar from the Agent button or floating orb.") },
  { id: "progress", title: text("生成进度", "Generation progress"), description: text("生成时在占位卡查看任务状态，可继续操作画布。", "Check task status on its placeholder while continuing to use the canvas.") },
];

export const helpText = (value: HelpText, english: boolean) => english ? value.en : value.zh;
