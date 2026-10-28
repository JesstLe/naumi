# R6U：角色节点能力整合与原生owner边界

## 目标、来源与当前状态

持续整体重构，唯一开发目录 `E:/Workspace/naumi-refactor-20261024`、分支 `codex/core-refactor-20261024`。上一片R6T已提交推送并封存；本片完整原树 `b24dfe58be6c9a79986221bcfa764b95a460b46f` 的4707文件逐字节归档、回读并提取独立副本。

主线固定 `3f3ac34cbed349f4cb51c0786cc174d33a627f5c`，5个新增提交、46路径，角色身份／外观／原生控件／混合历史／冻结制作链来自原模块，不重新开发第二套角色系统。普通merge遇到10处冲突；合并命令exit1及原文件归档保留。按本树现有owner整合，不恢复主线旧Canvas/db单体。工作区长期保留源于用户明确的独立整体重构要求，本片不合main、不SSH、不部署或操作发布锁。

## 公开接口与职责

- `character/project`与`character/references`保留主线纯模型及明确外观身份；角色引用仍是既有OrderedInput，服务端重读角色和正式素材并冻结入原任务。已受理任务先返回原幂等回执，不因后续角色编辑/删除重提。
- 角色卡片／编辑器／useCharacterNodes继续拥有原生UI和每节点版本保存；补充与现有节点一致的已提交记录accept接口，复制／删除由原node lifecycle更新显示，没增加独立轮询或任务状态。
- renderer registry／scene projection／stable actions负责角色卡片和连线，`project-catalog`负责角色项目与计数，页面不再增加角色渲染循环或项目汇总规则。
- `history-contract`／model／controller负责角色patch、可见性及混合动作，单次原HTTP事务、重试身份、CAS和undo/redo不拆开；`node-commands`／operations／copy-contract接复制删除，无第二套生命周期API。图片/文字的预期版本及canonical receipt保留。
- 原`node-deletion`、`node-copy`、`node-delete`数据owner扩展角色；混合复制重映射选中图片和角色alias，混合恢复在整步末尾复核角色素材，失败整步回滚。`db.ts`仍仅兼容导出，不新增实现。
- 角色DDL归既有canvas/storage-schema、pool级readiness与application/persistence启动组合；沿用主线两张角色表及原SQL，不在repository持有另一套进程全局ready。
- 项目归属共用project-access；保留authorizeVideoProject兼容名。新角色adapter直接导入真实Pool／素材／访问owner，避免穿透db兼容面及反向依赖。
- 原`VideoInputChoice`展示合同提为video/input-choice纯叶文件，client-settings保留类型兼容导出；character/canvas不反向依赖调用自己的client-settings。类别不进入wire。
- 单条角色→视频边删除携带原edgeId，只解除所选input，不删除同角色其他外观。原连线动作编译器拥有此规则，Canvas只转发手势，不复制字段写入。

## 集中验收与未完成项

完成完整模块后集中进行：完整旧树baseline、真实共享owner反例／原角色规则／实际组件及Next/PG/Worker/私有媒体/账务/混合历史/两镜头冻结；随后同固定SHA全core、架构、类型/lint、完整Linux同镜像运行与产品浏览器。供应商为明确fixture，不把付费人物质量或线上状态写成通过。

初次类型检查定位accept端口、旧复制方法名、节点记录可选字段和bindActualCreationProject的实际导入owner；已针对真实调用方修正。首次命令用npx交给Windows无shell子进程在创建进程前失败，改为直接node运行本地typescript；原记录保留。脚本接线时的断言/准备失败不冒充业务故障，失败记录不覆盖。

当前实现集中验收尚在进行，不称全片或整体重构完成；四产物、4707原hash独立副本回滚、Git/远端及自有资源清理以本片DELIVERY为最终回执。完整原角色业务记录保留在2026-10-27-character-native.md，后续仍有Canvas/助手外围编排、最终整合与性能容量验收。

首轮固定66a171aa的core为14通过／1失败／48未执行：持久化验收元数据仍按38个启动owner，新角色已使实际启动变39；补充版本化39-step预期及可选角色owner冷/热校验，未删除原冷启动、真实故障重试、在途账务保留断言。新增纯owner测试的首个失败是video fixture缺projectKey导致未进入当前项目投影，已补真实项目字段；原失败留证。结构观察器首次使用Windows默认GBK读Node UTF-8输出，改为显式UTF-8。

第二轮3cb9275b的core为27通过／1失败／35未执行：角色实际应用后端步骤完成，但Canvas初次访问500。真实pageerror与已打开截图确认本轮整合把import放在use client之前，修正Canvas、renderer registry及history hook的声明prologue，并加入实际源码prologue回归。不是Windows缓存或供应商问题。另补同一外观重复input的精确删除反例，过滤使用input.id而非nodeId；不新增重复引用限制。原应用失败、90秒控件等待与资源清理完整保留，后续导航先断言实际HTTP200以直接暴露编译错误。
