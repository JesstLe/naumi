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

第三轮87c3f2ec的core为27通过／1失败／35未执行：Canvas真实HTTP200且已编译，但页面报Invalid or unexpected token、未挂载节点。此轮没有将其认作供应商或业务拒绝；Windows dev初次解析根因尚未证明。观察器恢复原角色/导演测试使用的已安装Playwright headless shell（原适配改用Edge不是产品需求），复用导演原有的实际HTML与入口静态资源预热，并保存pageerror完整stack。资源仍通过真实HTTP取得，不mock、改写或过滤JS；原失败与cleanup保留，后续按实际结果判断。

906a0011的完整core已通过49项（含真实角色和导演应用），在原history投影夹具失败：从实际Canvas抽取的新组合引用characterNodesStore，夹具只提供video/director端口。补充明确的空角色store端口，不更改原图片/文字/视频断言或观察计数；新角色本身由共享owner39、规则38和真实应用验证，不拿空端口当角色行为证明。该SHA的完整Linux镜像、同镜像runtime125和产品browser36已经通过，保留原材料；最终固定版另行同源验收。

## 最终固定候选验收

应用与全部验收输入固定 `511ade12c1babfb05e5d91a5bae1e994939ff69b`，digest `5ed4a7fd45ab22fe7d5ca23263db3bd67bfc9aee1a68f9991496ca70ffa72054`；正式Dockerfile完整Web/Worker/media镜像 `sha256:e1d82ac86dde10eca5b01ecfb438e8a7bd49b6d99a26048269ba3b69c094c26d`。后续仅文档提交，最终Git SHA由DELIVERY另绑，不将文档提交冒充镜像应用源码。

- core-finalized：63/63全部本轮新执行，reused=0、failed=0、notRun=0，exit0；含新角色共享owner39/规则38/真实组件和完整角色应用、原导演WebGL/PNG/WebM/实际视频应用、history67场景184检查及原其余账务/权限/恢复/视频/Worker链路。不是拼接14、27或49项的旧批次。
- 角色实际应用：原生菜单创建/上传/外观编辑保存刷新、移动/锁定/复制/删除/undo/redo、真实handle与@及外观选择、只有角色输入的真实视频生成、混合复制图片/角色alias重映射、角色先于图片恢复及失败整步回滚；A→B制作链在A期间编辑/删除角色后仍使用B原冻结设定和原价，原operation重放不新增请求。模拟供应商创建5，真实付费0，pageerror0。
- 同一完整Linux镜像runtime125、产品双浏览器36通过，路由mock0/确认弹窗0、7交付/7笔42fixture积分、60秒混合读取；真实PG/Worker/私有媒体/原生FFmpeg/POSIX drain exit0。该产品浏览器矩阵与角色本地Next应用分别记录，不把通用Linux产品矩阵称为Linux角色全交互验收。
- 最终全项目tsc、受影响文件lint通过；原Canvas8个hooks warning保留。静态/全import/编译擦除两类SCC均0；原2条fixture→Route及1条billing client→toast仍单列。1874原src/services文件hash不变，db兼容面字节不变，主线22叶文件精确保留；两个纯角色规则模块保持主线原字节。
- Canvas5626→5687行是新增完整角色能力后的净变化，144/158原函数正文保持，14处原函数按角色适配明确改绑，0删除；5个新增角色创建/编辑/素材/草稿adapter记录为后续外围编排收敛对象，不把行数下降当唯一架构收益。

四产物、4707原hash独立副本恢复、原树owner7与菜单/模型/API缺席复现、补丁实际应用、哈希保护拒绝副本后来修改、远端一致及自有资源清理统一以本片DELIVERY为准。失败记录、字段/分支、每次命令与字面输出/退出码保留于VERIFICATION与FAILURE_INDEX；实际工作树保留整合后的角色能力。

## 整体目标仍未退出

本片不合main、不部署、不SSH或操作发布锁。原Canvas仍5687行、外围助手/界面组合及兼容入口退出继续推进；同机前后性能、容量和最终整合验收仍需按原R0—R6退出标准取证。静态SCC0、局部应用和本片完整包通过不等于10万活跃容量或整个重构交付。下一片先对照原退出表与实际代码收敛剩余助手/外围编排，不机械复制新功能到旧单体。
