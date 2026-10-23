import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, BackgroundVariant, ReactFlowProvider, Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { ArrowLeft, Check, ChevronDown, Focus, ImagePlus, Layers3, LockKeyhole, Minus, MousePointer2, Plus, RotateCcw, Search, Sparkles, Type, Video, X } from 'lucide-react';
import { CanvasNavigator } from '@/components/canvas/canvas-navigator';
import { SelectionLayoutControls } from '@/components/canvas/selection-layout-controls';
import { CreativePresets } from '@/components/canvas/creative-presets';
import { arrangeCanvasSelection, type SelectionLayoutAction } from '@/lib/canvas/selection-layout';
import { appendCreativePreset, type CreativePreset } from '@/lib/canvas/creative-presets';
import { canvasOutlineEntries } from '@/lib/canvas/navigator';
import '@xyflow/react/dist/style.css';
import './preview.css';

type FixtureData = { title: string; prompt?: string; content?: string; image?: string; nodeKind?: string; settings?: { locked: boolean }; pending?: boolean; width: number; height: number; sceneType?: string };
type FixtureNode = Node<FixtureData>;
const initialNodes: FixtureNode[] = [
  { id: 'image-a', type: 'image', position: { x: 70, y: 100 }, data: { title: '01 / 清晨 · 陶瓷咖啡杯', prompt: '晨光，鼠尾草绿，柔和接触阴影', image: './scene-1.svg', width: 240, height: 168 }, selected: true },
  { id: 'image-b', type: 'image', position: { x: 400, y: 160 }, data: { title: '02 / 暖沙 · 光影研究', prompt: '暖沙奶油，产品静物，细腻材质', image: './scene-2.svg', width: 240, height: 168 }, selected: true },
  { id: 'image-c', type: 'image', position: { x: 720, y: 80 }, data: { title: '03 / 雾蓝 · 配色方向', prompt: '雾蓝米白，柔光，通透清爽', image: './scene-3.svg', width: 240, height: 168 }, selected: true },
  { id: 'text-note', type: 'text', position: { x: 60, y: 405 }, data: { title: '拍摄笔记', content: '清晨的第一杯咖啡\n\n柔光从左侧进入。\n保留陶瓷的温润质感。\n叶片只作为轻盈的前景。', nodeKind: 'text', width: 238, height: 200 } },
  { id: 'video-a', type: 'videoGeneration', position: { x: 400, y: 465 }, data: { title: '镜头草案 / 缓慢推近', prompt: '静物镜头草案，仅本地卡片', image: './scene-1.svg', width: 240, height: 168 } },
  { id: 'pend-a', type: 'pend', position: { x: 720, y: 400 }, data: { title: '待创作 · 留白方案', prompt: '陶瓷杯，简洁背景，左侧留白', pending: true, width: 240, height: 168 } },
  { id: 'image-locked', type: 'image', position: { x: 1040, y: 150 }, data: { title: '锁定参考 · 暖沙', prompt: '锁定的本地合成卡片，不参与布局', image: './scene-2.svg', settings: { locked: true }, width: 240, height: 168 } },
  { id: 'workflow-group', type: 'workflowGroup', position: { x: 1050, y: 455 }, data: { title: '产品方向组', content: '01 + 02 + 拍摄笔记', width: 220, height: 110 } },
];
const cloneInitial = () => structuredClone(initialNodes);
const ACTION_NAMES: Record<SelectionLayoutAction, string> = { left: '左对齐', centerX: '水平居中', right: '右对齐', top: '顶部对齐', centerY: '垂直居中', bottom: '底部对齐', distributeX: '水平等距分布', distributeY: '垂直等距分布' };
function SceneCard({ data, selected, type, id }: NodeProps<FixtureNode>) {
  if (type === 'workflowGroup') return <div className={`group-card ${selected ? 'selected' : ''}`} data-fixture-node={id}><Layers3 size={19}/><strong>{data.title}</strong><small>{data.content}</small></div>;
  return <div className={`scene-card ${selected ? 'selected' : ''} ${type === 'text' ? 'text-card' : ''}`} style={{ width: data.width }} data-fixture-node={id}>
    <header><span>{type === 'text' ? <Type size={13}/> : type === 'videoGeneration' ? <Video size={13}/> : <ImagePlus size={13}/>}</span><strong>{data.title}</strong>{data.settings?.locked ? <LockKeyhole size={12}/> : selected ? <Check size={12} className="selected-check"/> : <span className="node-dot"/>}</header>
    {type === 'text' ? <div className="note-content">{data.content}</div> : type === 'pend' ? <div className="pending-content"><Sparkles size={27}/><strong>待创作</strong><small>本地 UI 占位</small></div> : <div className="image-wrap"><img src={data.image} alt="本地代码合成的陶瓷杯静物示意" draggable={false}/>{type === 'videoGeneration' && <span className="video-mark">▷ <small>镜头草案</small></span>}</div>}
    {type !== 'text' && <footer><span>local synthetic scene</span><span>{type === 'pend' ? '未生成' : type === 'videoGeneration' ? '无视频请求' : 'SVG · 本地'}</span></footer>}
    <Handle type="target" position={Position.Left}/><Handle type="source" position={Position.Right}/>
  </div>;
}
const nodeTypes = { image: SceneCard, text: SceneCard, pend: SceneCard, videoGeneration: SceneCard, workflowGroup: SceneCard };
function Preview() {
  const [nodes, setNodes] = useState<FixtureNode[]>(cloneInitial);
  const [selectedIds, setSelectedIds] = useState(['image-a', 'image-b', 'image-c']);
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [prompt, setPrompt] = useState('一只温润的陶瓷咖啡杯，清晨柔和的自然光。');
  const [mode, setMode] = useState<'image' | 'blank'>('image');
  const [status, setStatus] = useState('本地场景已就绪');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(70);
  const [undo, setUndo] = useState<Array<{ nodes: FixtureNode[]; action: SelectionLayoutAction }>>([]);
  const [events, setEvents] = useState<string[]>([]);
  const api = useReactFlow<FixtureNode>();
  const live = useRef({ nodes, selectedIds, busy, undo, prompt, events });
  live.current = { nodes, selectedIds, busy, undo, prompt, events };
  const entries = useMemo(() => canvasOutlineEntries(nodes), [nodes]);
  const selectedNodes = nodes.filter(n => selectedIds.includes(n.id));
  const layoutBlocked = selectedNodes.some(n => n.data.settings?.locked || n.type === 'pend' || n.type === 'workflowGroup');
  const select = useCallback((ids: string[]) => {
    const eligible = ids.filter(id => live.current.nodes.some(node => node.id === id && node.type !== 'workflowGroup'));
    setSelectedIds(eligible); setNodes(current => current.map(node => ({ ...node, selected: eligible.includes(node.id) })));
  }, []);
  const fitIds = useCallback((ids: string[], duration = 280) => {
    const targets = api.getNodes().filter(node => ids.includes(node.id));
    if (targets.length) void api.fitView({ nodes: targets, padding: .45, maxZoom: 1, duration });
  }, [api]);
  const locate = useCallback((id: string) => {
    const node = live.current.nodes.find(node => node.id === id); if (!node) return;
    if (node.type === 'workflowGroup') select(['image-a', 'image-b', 'text-note']); else select([id]);
    fitIds([id]); setStatus(`已定位 · ${node.data.title}`);
  }, [fitIds, select]);
  const arrange = useCallback(async (action: SelectionLayoutAction) => {
    const snapshot = live.current; if (snapshot.busy) return;
    const selected = snapshot.nodes.filter(node => snapshot.selectedIds.includes(node.id));
    if (selected.some(node => node.data.settings?.locked || node.type === 'pend' || node.type === 'workflowGroup')) { setStatus('锁定、待创作与分组节点不参与布局'); return; }
    const moves = arrangeCanvasSelection(selected.map(node => ({ id: node.id, x: node.position.x, y: node.position.y, width: node.data.width, height: node.data.height + 56 })), action);
    if (!moves.length) { setStatus('选区位置无需改变'); return; }
    setBusy(true); live.current.busy = true;
    // Explicit fixture transaction. This is never an API or supplier request.
    const transaction = [`persist:local:${action}`, 'persist:ack'];
    await new Promise(resolve => setTimeout(resolve, 90));
    const map = new Map(moves.map(move => [move.id, move.to]));
    setNodes(current => current.map(node => map.has(node.id) ? { ...node, position: map.get(node.id)! } : node));
    setUndo(current => [...current, { nodes: structuredClone(snapshot.nodes), action }]);
    setEvents(current => [...current, ...transaction, 'undo:push']);
    setStatus(`${ACTION_NAMES[action]} · 本地事务已保存 · 可撤销`); setBusy(false);
  }, []);
  const applyPreset = useCallback((preset: CreativePreset) => { setPrompt(current => appendCreativePreset(current, preset)); setStatus(`已追加「${preset.label}」· 未发起生成`); }, []);
  const reset = useCallback(() => { setNodes(cloneInitial()); setSelectedIds(['image-a','image-b','image-c']); setUndo([]); setEvents([]); setStatus('本地场景已重置'); void api.fitView({ padding: .18, maxZoom: .8, duration: 0 }); }, [api]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { const target = event.target as HTMLElement; if (target?.closest('input,textarea,[data-canvas-hotkeys-blocked="true"]')) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setNavigatorOpen(true); } if (!event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'f') { event.preventDefault(); fitIds(live.current.selectedIds); } };
    window.addEventListener('keydown', onKey);
    (window as any).__JIMENG_FIXTURE__ = { fixture: 'local UI fixture', getState: () => ({ ...structuredClone(live.current), networkGeneration: false }), reset, select, arrange, fitSelection: () => fitIds(live.current.selectedIds) };
    return () => { window.removeEventListener('keydown', onKey); delete (window as any).__JIMENG_FIXTURE__; };
  }, [arrange, fitIds, reset, select]);
  return <div className="preview-app">
    <div className="fixture-banner"><span className="fixture-dot"/><strong>local UI fixture</strong><span>实际 React 组件 · 本地合成场景 · 无供应商请求</span><span className="offline-label">OFFLINE</span></div>
    <header className="app-header"><div className="project-heading"><button aria-label="项目首页" onClick={reset}><ArrowLeft size={17}/></button><span className="brand-mark">n</span><span className="header-divider"/><div><strong>晨光 · 产品视觉研究</strong><small>本地画布 / 交互预览</small></div><ChevronDown size={14}/></div><div className="header-actions"><span className="saved-indicator"><Check size={13}/>本地状态</span><span>{entries.length} 个节点</span><button onClick={reset}>重置场景</button></div></header>
    <main className="workspace">
      <ReactFlow<FixtureNode> nodes={nodes} edges={[]} nodeTypes={nodeTypes} onNodesChange={changes => { setNodes(current => current.map(node => { const positionChange = changes.find(change => change.type === 'position' && change.id === node.id) as any; return positionChange?.position ? { ...node, position: positionChange.position } : node; })); }}
        onNodeClick={(event, node) => event.shiftKey ? select(live.current.selectedIds.includes(node.id) ? live.current.selectedIds.filter(id => id !== node.id) : [...live.current.selectedIds, node.id]) : locate(node.id)}
        onPaneClick={() => select([])} onMove={(_, viewport) => setZoom(Math.round(viewport.zoom * 100))} fitView fitViewOptions={{ padding: .18, maxZoom: .8 }} minZoom={.12} maxZoom={2} nodesConnectable={false} selectionOnDrag={false} proOptions={{ hideAttribution: true }} className="fixture-flow">
        <Background color="#cdd5d8" gap={22} size={1} variant={BackgroundVariant.Dots}/>
      </ReactFlow>
      {navigatorOpen && <CanvasNavigator entries={entries} selectedIds={selectedIds} onLocate={locate} onSelect={ids => { select(ids); fitIds(ids); setStatus(`已选择 ${ids.length} 个节点`); }} onClose={() => setNavigatorOpen(false)} onFit={() => void api.fitView({ padding: .18, maxZoom: .8, duration: 280 })} onFitSelection={() => fitIds(selectedIds)}/>}
      <div className="workspace-top"><button className="outline-toggle" aria-label="显示画布大纲" onClick={() => setNavigatorOpen(open => !open)}><Search size={15}/>大纲<span>⌘ K</span></button><span className="canvas-label"><MousePointer2 size={13}/>选择工具</span><div className="top-note">Shift + 点击可多选</div></div>
      <div className="selection-strip"><div className="selection-count"><span/>{selectedIds.length ? `已选择 ${selectedIds.length} 个节点` : '未选择节点'}</div><SelectionLayoutControls count={selectedNodes.length} disabled={layoutBlocked} busy={busy} onArrange={arrange}/><span className="strip-divider"/><button aria-label="撤销本地布局" title="撤销本地布局" disabled={!undo.length || busy} onClick={() => { const previous = undo.at(-1); if (!previous) return; setNodes(previous.nodes); setUndo(current => current.slice(0, -1)); setStatus('已撤销本地布局'); setEvents(current => [...current, 'undo:restore']); }}><RotateCcw size={15}/></button></div>
      <section className="fixture-composer" data-testid="fixture-composer"><div className="composer-heading"><div><Sparkles size={14}/><strong>{mode === 'image' ? '图片创作' : '空白节点创作'}</strong></div><div className="mode-toggle"><button aria-pressed={mode === 'image'} onClick={() => setMode('image')}>图片</button><button aria-pressed={mode === 'blank'} onClick={() => setMode('blank')}>空白</button></div></div><div className="composer-body">{mode === 'image' && <div className="reference-chip"><img src="./scene-1.svg" alt="本地合成参考卡片"/><span>本地场景参考</span><small>合成 SVG</small></div>}<textarea aria-label="创作提示词" value={prompt} onChange={event => setPrompt(event.target.value)} rows={4}/></div><div className="composer-options"><CreativePresets onApply={applyPreset}/><button className="aspect-button">1:1 <ChevronDown size={11}/></button><span>本地预览</span></div><footer><span><i/>不连接生成服务</span><button className="generate-button" disabled><Sparkles size={13}/>生成已禁用</button></footer></section>
      <div className="viewport-controls"><button aria-label="缩小" onClick={() => void api.zoomOut({ duration: 150 })}><Minus size={15}/></button><span>{zoom}%</span><button aria-label="放大" onClick={() => void api.zoomIn({ duration: 150 })}><Plus size={15}/></button><i/><button aria-label="适配选区" onClick={() => fitIds(selectedIds)}><Focus size={16}/></button></div>
      <div className="fixture-status" role="status"><span className="status-dot"/>{status}<small>{undo.length} 步本地撤销</small></div>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<ReactFlowProvider><Preview/></ReactFlowProvider>);
