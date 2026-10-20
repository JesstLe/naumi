# 2026-10-20 多参考图自动画幅优化

## 范围与基线
- 独立 worktree `E:/Workspace/naumi-multi-reference-frame-20261020` / `codex/multi-reference-frame-20261020`，父 `c3fa3a5a`，已 fetch origin/main `3f940b86`；包含本线程前序回执修复，不覆盖共享 checkout 未提交。
- 用户截图显示「有多张参考图，请明确本次生成画幅比例后再预览」。根因是 `defaultFrameSource` 只接受唯一引用，不比较多参考图实际比例，planner 在报价前拒绝，Canvas 将准备失败展示为失败占位。

## 实现
- 服务端共用 `frameCandidates/defaultFrameSource`：单源/明确编辑底图/蒙版保持原规则；多布局参考实际约分后比例相同则直接沿用，不根据输入顺序挑不同画幅。插入产品及风格不参与布局参考共识。无效尺寸仍报素材错误。
- Canvas 使用已有素材上传返回的真实宽高预判，不增加上传或付费调用。同画幅无需弹窗；异画幅显示独立轻量浅色选择，仅选择跟随参考画幅，不恢复已删除的重复创作参数面板。用户明确选择后作为本次显式比例进入预览、报价、冻结与单次提交。
- 取消关闭/Escape 不保存新任务回执、不发起 plan/生成，runGen 清理临时占位，generatePend 保留可编辑空白节点及输入草稿。账号/项目切换取消选择；并行节点选择排队，不覆盖彼此 Promise。
- Legacy multipart 顺序解码需要参与画幅共识的图片，尊重 EXIF；同画幅通过，真正异画幅保留明确的选比例提示。未改特殊工具的 legacy UI。
- 用户显式比例、精确宽高、蒙版、抠图/后处理、管理员映射/价格、历史冻结任务、已有回执查询和供应商执行链均保持。

## 验收进度
- 集中验收：多参考 helper/Sharp/Canvas submitter 46项、自动比例/native-grid/管理员映射133项、真实 planner/quote/frozen/FormData 70项、回执7项、HTTP契约、真实Canvas命名函数26+24项、编辑收尾9项、恢复选择18项、choice hook并发/过期点击/账号项目卸载13项、tsc。
- 实际Next15 CanvasClient在独立本机fixture验证：三参考进入浅色选择，继续前plan/submit均0；取消/Escape保留提示词与空白节点，无失败文案；选4:3后plan1/submit1、三参考全保留、供应商0。桌面1920宽及390×844截图已打开检查，窄屏dialog366宽、无横向溢出、两图完整加载。T3截图/resize失效，保留原始错误，改用专用Chrome标签页/扩展能力，无CDP、不操作日常标签。
- 浏览器同画幅另跑：无选择弹窗/无「生成未开始」文案，新增plan1/submit1，保持raw auto；服务端真实planner另验冻结为3:4。Chrome日志仅见既有fixture在head注入登录脚本造成的hydration属性警告，未宣称console全零；未观测交互崩溃，fixture API错误0。
- 基线新probe复现同画幅被拒绝；最终独立副本回退及四产物见output/multi-reference-frame-20261020/VERIFICATION.txt。
- 供应商调用0、47操作0。只本地修复及任务分支push，不合main、不发布。
- 功能同步计数：上一轮同步后0 → 本模块1；无额外main整合。
