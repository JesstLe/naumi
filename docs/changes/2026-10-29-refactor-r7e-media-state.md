# R7E：媒体状态持久化职责与图像流水线主线接入

## 目标与模块所有权

持续整体重构：本轮将媒体Worker快照、原子写入、退休回执和过期回执读取清理收敛到 `services/media-worker/state-store.mjs`；HTTP入口拥有鉴权/协议，现有执行器拥有媒体进程，任务/账务/作品仍由App原模块负责。无新表、第二任务系统或自动付费重试。

## 主线接入

基线为R7D实际完整字节0852439d，4943文件逐hash归档。普通整合固定main e1878018的8提交，唯一chroma冲突同时保留原显式Buffer类型和新decoded/alpha重用。线性供应商Markdown解析、像素复用和实际缩图保留顺序PNG源，不恢复all-raw缩图已证内存回退。

## 本轮发现与实现

1. 原POST先把job加入内存再写首次queued快照；原生写失败返回400，但相同operation重试会返回旧queued、永远不执行。先保存原快照，再发布内存受理。
2. 原engine结束先公开terminal，随后异步写盘；GET/PATCH可能在rename前确认并删除目录。终态落盘进入原有job lock，GET/PATCH/collector不与该次终态写盘交错。没有新锁系统。
3. 原atomicJson的finally清理异常会替换主写入异常；现在保留原错误，并记录原生write/rename/cleanup阶段和errno。
4. 诊断只含event、operation、任务id、step、code，不记录路径、请求、输出或凭据；不靠新增重试隐藏写盘错误。已知结果在终态写失败时仍按既有逻辑保留给App，绝不重新执行engine或付费请求。

## 历史开放项与验证状态

R7D scene应用ECONNRESET及seed MEDIA_STATE_WRITE_FAILED现场保留，历史失败的具体底层errno尚未捕获。本轮上述边界有可控、实际HTTP/文件系统反例，不能据此宣称历史事故唯一根因。生产实现已完成，集中baseline/modified、退休兼容、原生媒体与图像链路验证随后执行。整体ACTIVE，未合main未部署，47 HOLD。

## 集中验证观察

- 实际媒体Worker子进程/HTTP/原生文件系统可控故障对照：旧4组24检查，修复4组34检查；首次保存失败不留ghost，同operation可执行，processing保存失败仍返回原MEDIA_STATE_WRITE_FAILED且engine0调用，terminal rename完成前GET不提前公布可清理终态，主错误不被cleanup错误替换。
- 注入EIO/EPERM/EACCES是明确测试输入，不当作历史事故实际errno；新版日志4条最小字段均有对应断言。终态gate反例使用实际目录删除/rename交错，不复制产品状态机。
- 主线像素pipeline：原41场景233检查，优化预算27项不满足（预期exit1）；新41场景409检查、预算0不满足/exit0。实际Sharp，像素/alpha/EXIF/ICC/编码和失败保真；真实resize保留顺序PNG源，不声称all-raw更省内存。
- X4线性解析含真实loopback HTTP66检查、1MiB输入deadline、原PNG字节/像素和恢复语义通过。原媒体/本地编辑/mask等调用方PASS。
- 既有共享退休测试实际9进程/原60秒collector通过；新state-store打包显式加入生产Dockerfile，避免只改源文件却遗漏运行时依赖。
- TypeScript/lint exit0，37条既有warnings保留；源码固定后完整镜像、实际场景及相邻回归结果另记。

### 保留的准备失败

新增pipeline verifier原来只匹配pngload字符串，本机libvips返回vipspng:libpng read error；保留错误语义，只补跨平台libpng名称。modified第一次未指向已生成的baseline-results.json，修正输入目录后通过；原日志不覆盖。早期三组媒体观察仍作历史，最终4组包含processing失败的公共码兼容和实际errno诊断。

## 最终固定源码的运行证据

- 应用固定 `4980c0184119de1ee13913104f8bf11aae5e0d73`，digest `4efa27672896fe5f9f29ef654154d8f951a7827e8ef5839b87cb27279e10e1a2`；完整生产Dockerfile镜像 `sha256:bc32ffe43bd5ce85a8c52844008fb8842ce1bae87ae2aae39ba3681fc0cf7333`，state-store实际封装在镜像内。
- 受影响18个原入口全新执行18PASS/失败0/未运行0；原runner状态PARTIAL只指选择了18个入口，不是完整core。未拿R7D的102项跨SHA拼为本轮全量通过。
- 同一固定镜像内原生媒体HTTP40项通过：真实FFmpeg/C launcher、帧/裁剪hash、原operation、排空、取消、SIGTERM、重启及退休回执；单独原共享scratch9进程51断言及真实60秒collector通过。Windows symlink权限用例明确沿原脚本标为unavailable，未冒充已执行。
- 同完整镜像实际Web+Worker产品双浏览器37项通过；真实PG/原HTTP/7笔各6积分fixture交付、路由mock0、确认弹窗0，所有自有产品容器/网络/PG tmpfs清理通过。没有付费外部供应商调用。
- 上轮失败的真实scene应用本轮一次完整运行exit0，场景/导演真实控件、PG、冻结工作流、采用/混合事务/引用原链通过；原失败日志不改写，也不据此关闭历史底层MEDIA_STATE_WRITE_FAILED根因。注入errno仅证明诊断合同，非历史errno取证。
- TypeScript/lint exit0，原37 warnings；四类SCC0。未运行本轮完整core104及完整runtime177，不将旧source证据改标。后续全量退出仍需统一最终source验证与性能/INP/容量、远端required CI、main最终整合。
- 本轮完整源码、字节patch、逐命令输入/字面输出/退出码、独立副本回滚及远端SHA以ignored R7E VERIFICATION/DELIVERY为准；整体ACTIVE，不合main不部署，47 HOLD。
