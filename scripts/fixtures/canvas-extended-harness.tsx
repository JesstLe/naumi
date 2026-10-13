import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageCropDialog } from '../../src/components/canvas/image-crop-dialog';
import { CanvasParameterPopover } from '../../src/components/canvas/parameter-popover';
import { NodePropertiesPanel } from '../../src/components/canvas/node-properties-panel';
import type { ImageSkill } from '../../src/lib/image-skills/catalog';
import { CanvasAssistantPanel } from '../../src/components/canvas/canvas-assistant-panel';
import { SkillBook } from '../../src/components/image-skills/skill-book';
import { defaultNodeSettings } from '../../src/lib/canvas/node-settings';
import { OFFICIAL_IMAGE_SKILLS } from '../../src/lib/image-skills/catalog';

const metrics = { closes: 0, sends: 0, saves: 0, renames: 0, skillSelected: 0 };
const mode = new URLSearchParams(location.search).get('mode') || 'crop';
function Harness() {
  const [shown, setShown] = useState(false), [busy, setBusy] = useState(false), [readOnly, setReadOnly] = useState(false), [input, setInput] = useState('中文尚未确认');
  const [settings, setSettings] = useState(defaultNodeSettings()), [selected, setSelected] = useState<ImageSkill | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { metrics.closes++; setShown(false); };
  useEffect(() => { Object.assign(window, { auditFixture: { metrics, officialSkills: OFFICIAL_IMAGE_SKILLS, setBusy, setShown, setReadOnly,
    focusBackground: () => document.querySelector<HTMLButtonElement>('#background-control')?.focus() } }); }, []);
  const labels = { title:'画布助手',newChat:'新对话',history:'历史对话',close:'关闭助手',back:'返回对话',morning:'早上好',afternoon:'下午好',evening:'晚上好',question:'创作',changeTasks:'换一组',placeholder:'输入消息',send:'发送',references:'参考图',closeReferences:'关闭参考图',currentImage:'当前图片',upstreamImage:'上游图片',thinking:'处理中',copy:'复制',copied:'已复制',emptyHistory:'没有记录',currentChat:'当前对话',agent:'Agent',mode:'模式',retry:'重试',scrollToBottom:'到底部' };
  return <div className="canvas-ui-light" style={{height:'100vh',position:'relative',display:'flex',background:'#f6f7f9',padding:12}}>
    <div style={{alignSelf:'flex-start',display:'flex',gap:12}}><button id="background-control">背景按钮</button>
      <button ref={trigger} onClick={()=>setShown(true)}>打开测试组件</button></div>
    {mode==='skills' && <SkillBook selected={selected} onSelect={skill=>{metrics.skillSelected++;setSelected(skill);}} accountKey="canvas-audit@example.test" />}
    {shown && mode==='crop' && <ImageCropDialog image="/fixture.png" title="测试图片" light english={false} busy={busy}
      onApply={async()=>{metrics.saves++;setBusy(true);}} onClose={close} />}
    {shown && mode==='parameters' && <CanvasParameterPopover anchorRef={trigger} light onClose={close}>
      <button>1K</button><button>2K</button><button>1:1</button><button>确认参数</button>
    </CanvasParameterPopover>}
    {shown && mode==='properties' && <NodePropertiesPanel title="测试文字" kind="text" settings={settings} light english={false} busy={busy} readOnly={readOnly}
      displaySize={{width:320,height:240}} content="文字预览" onSave={async value=>{metrics.saves++;setSettings(value);return true;}}
      onCrop={()=>{}} onReplace={()=>{}} onClose={close} />}
    {shown && mode==='assistant' && <CanvasAssistantPanel light anchorTitle="测试项目" contextImages={[]} turns={[]} input={input} busy={busy} error={null}
      costLabel="fixture" labels={labels} tasks={[]} onInputChange={setInput} onSend={()=>{metrics.sends++;}}
      onNewChat={()=>{}} onRestoreChat={()=>{}} onClose={close} onPreview={()=>{}} onCopy={async()=>true} renderContent={content=>content}
      historyLoader={async()=>[{id:'cv-fixture-history',title:'现有名称',turns:[]}]} onRenameHistory={async()=>{metrics.renames++;}} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
