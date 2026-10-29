# 当前图片编辑输入与上传参考草稿修复

## 基线与目标

基于 main `9ab916c1d84e589391a5a50a03c0b471fae84d60`，分支 `codex/canvas-reference-retention-20261029`，独立工作区 `E:/Workspace/naumi-canvas-reference-retention-20261029`。原始包、SHA和共享19个脏文件快照保存在 `E:/Workspace/naumi/output/canvas-reference-retention-20261029`。保持服务器暂缓发布；不恢复已取消的旧音频失败日志读取进程，不重放业务任务，不重试旧清理拒绝。

用户反馈：希望编辑当前A图时真实使用A，连线B作为参考；手动上传的参考图不因收起/切换回来或再次生成而丢失。前次只读排查已用10组实际源码/FormData/React生命周期对照定位：`0c4acb5a`把普通参考收集变为incoming-only；取消选中清上传是更早已有逻辑；当前单纯生成完成不清上传。

## 模块与职责

- `input-references.ts`：普通原位更新的输入仍包含当前图片，默认排在连接参考前；结果写回位置由原canvasTarget/版本模块负责，两者分开。已有canvas-add隐藏父节点、真实输入校验、16图技术边界和特殊工具规则保持。
- `image-references.ts`：仅首次把当前图补回旧草稿时默认设为编辑目标，旧引用图号保持；有过该图用途记录后不覆盖用户显式选择，也不偷偷重加已移除图片。
- `image-reference-drafts.ts`与`use-image-reference-draft.ts`：只拥有临时File、稳定上传引用身份与ObjectURL生命周期。节点取消选中不清文件；不同节点/项目/工作空间隔离；账号/查看对象切换和组件卸载释放旧预览，显式删除释放对应预览。文件不序列化到sessionStorage，不新建媒体/任务体系。
- 原图片草稿继续拥有提示词、比例、编号/用途和显式隐藏的节点参考；个人旧key兼容，企业工作空间独立。文件保留限当前画布会话；整页刷新后恢复File未作为本轮承诺。
- CanvasClient仅接入上述模块，保留原位历史/CAS/报价/付费受理/失败恢复等已有链路。明确移除当前图可以只按剩余参考生成；提供必要的恢复节点参考操作。

## 本次实现与迁移状态

核心修复与集中本地验收已通过，完整四件套和最终main回执见证据目录。修改前基线已复现：有连线只发送B，无连线零图片；上传在取消选中时丢失。此次不回滚整个原位版本模块，不改供应商配置，不和其他画布问题混为一个修复。

## 已验证结果

已集中覆盖真实输入A/B/上传图像素与预览/请求一致；旧绑定迁移及显式目标/引用-only/隐藏恢复/编号；收起重开、A-B-A、重复生成、失败重试、生成中切换；账号/项目/工作空间/只读隔离与预览URL释放；原位ID/布局/连线/历史/CAS/幂等与账务相邻回归。供应商仅隔离fixture，真实付费0。

## 未完成项与下一步

最终源码/补丁/验证记录/可执行回滚脚本、独立副本回滚与Git整合回执保存在证据目录；以git-delivery.json的远端SHA为准。文件仅在同一画布会话内保留；整页刷新、关闭页面后的File恢复未扩展。上线状态单独报告，当前没有服务器发布。


### 集中证据与边界

- `core-final`：39检查通过。实际抽取Canvas主操作/runGen/appendComposerReferences执行，检查真实FormData里的A、B、上传U及原位canvasTarget；旧绑定补A的默认目标、保留原图号、显式换目标/参考-only/删除、15+1边界、URL释放/失败回收/工作空间key通过。
- `ui-final`：14场景、真实React19 StrictMode/现有ImageReferenceComposer/草稿hooks、源码上传和引用投影、实际submitCanvasImagegen→inputs/plan→真实schema/提示词编译通过。红A/蓝B/绿U图片像素核实；关闭重开、A-B-A、重复生成、修改用途、显式移除/恢复、进行中换节点、项目/工作空间隔离、只读/旧回调/账号切换/卸载释放、390px组件布局通过。API和生成响应是本地fixture，不冒充供应商效果。
- `native-sixth`：完整真实Next CanvasClient 8场景通过。实际关闭按钮、A-B-A、红A+蓝B+绿U传图、第二次使用更新后的黄A+原B/U、原位ID/几何/连线保持、失败保图保上传、移除和恢复、真实版本undo/redo通过。桌面与390px截图已打开；整画布移动端仅断言文档无横向溢出，现有移动端创作栏布局另有空间，未扩大为全面移动端UX已验收。接口/账号/结果为隔离fixture。
- 独立真实PostgreSQL：图片版本16项、原位生成plan→durable parent/child→本地HTTP供应商→存储→同节点历史→幂等结算、未知受理不重发、durable receipt和部分失败保留通过。真实供应商/付费调用0。
- 相邻规则：原引用与图号、节点草稿55、原位入口、作用域历史12、结果落点5、冻结报价138组1208断言、自动报价7、scope receipt23通过；最终类型与lint以VERIFICATION.txt精确命令/exit为准。

### 失败保留与环境修正

- 初次依赖误接到共享管理UI旧React18且缺Three，类型与首次完整画布环境失败；仅把本任务node_modules链接改到现有完整主线依赖，未安装/修改共享依赖，类型随后通过。
- 本机E盘可用不足10GiB，完整Next验收缓存放本任务C盘目录（启动前约60GiB可用），未删除其他目录。跨盘缓存解析需要完整NODE_PATH；初轮环境日志保留。Next自动修改的本任务tsconfig已恢复原字节，不提交生成配置。
- 完整UI驱动初轮把页面上5个同accept文件框都当作目标，后限定到实际图片composer；另一次在尚未执行undo时错误期待history POST，改为实际点undo/redo并验证CAS及版本，原失败保留。
- 旧冻结报价fixture缺主线新增consumePendingNodeHistory回调；修改前原始main同样69场景后失败，仅补fixture回调，不改业务历史/报价规则，现138场景全部通过。
