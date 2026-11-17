# Desktop 创作 MCP 对接契约 v1.1

## 所有者和接线

Naumi拥有Gateway、CLI/MCP、工具schema及业务执行；Desktop拥有账号授权界面、系统密钥库、按账号/会话注册与原生文件交付。Desktop的页面登录不是工具授权。

使用现有Harness `@deepseek-ai/dsh-mcp-client`和`@deepseek-ai/dsh-skill-filesystem`，在**单账号/会话scope**中加载本仓库`integrations/desktop/naumi-creation.mjs`。不要在所有成员共享的全局scope挂某个人的令牌。本站本轮未修改Desktop共享checkout。

```js
import {installNaumiCreation, presentNaumiDownload} from './naumi-creation.mjs';
// mcpClient / filesystemSkills直接使用Desktop已有官方插件。
const dispose = await installNaumiCreation(accountSessionScope, {
  bundle: absoluteVerifiedBundle,
  expectedManifestSha256: manifestHashPinnedInDesktopRelease,
  site: explicitHttpsOrigin,
  account: signedInAccountEmail,
  tokenFile: accountProtectedTokenFile,
  workspace: selectedEnterpriseId || '',
  fileRoot: actualSessionWorkspace,
  node: bundledNodeExecutable,
}, {mcpClient, filesystemSkills});
// 换号/登出：await dispose()；它dispose原Harness Fiber，关闭旧MCP再接下一账号。
// 安装返回不代表注册/授权就绪；检查namespace并调用naumi_connection确认。
// 完成下载后，以同一Agent Session经原工具执行器调用present，不直接写事件。
await presentNaumiDownload({receipt: downloaded.structuredContent,
  fileRoot: actualSessionWorkspace, signal,
  present: args => executeNativePresentThroughHostPolicy(args),
});
```

`executeNativePresentThroughHostPolicy`由Desktop现有工具执行器提供，并绑定原Agent/turn/权限。仅拿到路径或resource_link不是文件卡。适配器验证本地真实文件、长度/SHA、真实路径归属，再调用原present；不创建替代账本或伪造`deliverables/presented`。

## 明确授权，不复制认证系统

1. 账号中心`/account/agent`既有浏览器会话管理接口创建**Desktop专用令牌**；沿原`read/write`、每日积分预算、有效期、撤销。无需新令牌表。
2. Desktop通过自己的受保护输入/系统凭据库接收秘密；不让模型看到令牌，不把秘密写进MCP配置文本、参数、日志或聊天。运行时将账号专属临时令牌文件限制为当前OS用户可读；退出时由Desktop删除。Windows文件ACL由宿主负责，POSIX mode不能冒充Windows ACL。
3. MCP子进程仅接收令牌文件路径。`--desktop`拒绝默认profile或环境token兜底；要求显式site/account/fileRoot。启动和每次工具调用验证`/me.account.email`，换账号不复用进程。
4. `NAUMI_WORKSPACE`给**全部HTTP请求**带`x-naumi-workspace`；企业membership/有效授权和工具权限仍由原服务端决定。个人空值不继承旧profile企业。
5. `naumi_connection`返回无秘密的账号/预算/令牌元信息；授权有效不等于供应商/模型已就绪。吊销后后续请求401；已受理任务不因删除本地配置而被撤销。

## 工具发现与稳定任务

- `naumi_tools {}`每次获取实时完整目录，包含schema、write/billed/timeoutMs/available；不缓存为整个进程的永久名单。
- Desktop MCP直接投影当前可用只读工具；所有写操作统一走`naumi_call {tool,arguments,operationId,request?}`。它是原Gateway调用信封，不是新任务系统。需要具体参数先读目录。
- 在宿主持久化**site/account/tokenId/workspace/operationId/原完整参数**后才提交。外层operationId与内层`operation_id`或`request.operationId`分别保存，不能互相覆盖。
- 断网/超时/进程退出后仅`naumi_call_status {operationId}`；unknown保留。不得根据MCP request id生成新付费编号，不以OPERATION_NOT_FOUND自动重提（可能是错误账号/令牌/空间）。同号变参409由原Gateway判定。
- 当前Gateway的状态回执按**tokenId + operationId**归属，status/media旧路由不会因传不同workspace自动按原任务tenant重做授权。宿主恢复必须绑定原账号/原token/原scope；不要把客户端header透传说成服务端按workspace隔离历史回执。按原任务企业membership撤权后的receipt/media授权是后续具名切片，不能只给GET加creation选项便宣称修好。
- CLI非Desktop的原直接工具调用保持兼容。MCP新辅助接口是向后兼容增量；Desktop写工具不直接暴露随机编号调用。

## 首条图片链

`naumi_upload_image {path}`→返回原作品id/url→持久化外层UUID→`naumi_quote`（可选）→`naumi_call`（例如generate_image image_urls引用上传URL）→状态/恢复原编号→原结果output.media/details→`naumi_download_media {url,out}`→长度/SHA回执→同会话原生present。

上传是已有独立写操作，当前没有客户端幂等上传契约；不要把`@file`放到对未知付费调用的重试中重新上传。先保存上传回执，后续原参数仅使用原URL。报价积分是服务端上限，不伪装为最终实扣；最终账务以原账本/领域task/artwork回执关联验证。

Desktop文件读写限定在显式fileRoot，解析真实路径防越界；下载流写独占临时文件再发布，返回SHA256/bytes/contentType，已有不同文件报FILE_CONFLICT，部分下载不成为正式文件。当前单文件256MiB；更大视频需后续受控流式续传切片。

## 画布上下文与未覆盖项

远程Gateway没有网页selected node、active project、鼠标位置等隐式状态。现有视频/分镜/制作链/多轨工具已在真实schema接受project_key/node_id/revision等明确身份；沿其领域API和CAS写回。Desktop须显式选择这些身份，不允许拿页面当前选中作为远程默认。

通用项目创建/搜索、图片文字节点增删、通用连线、布局/撤销等未形成完整Gateway工具切片。本轮不通过网页点击、任意坐标或直写数据库冒充已支持；能力矩阵逐项标缺口。后台供应商/充值/账号管理不混入普通创作目录。

## 固定分发与兼容

`node scripts/package-naumi-desktop.mjs output/desktop-release-<id>`在干净固定commit打包：naumi.mjs、Skill、宿主适配器、本文、manifest。manifest记录全部文件SHA256、sourceCommit、client1.1.0/Gateway1/Node>=18/stdio。**宿主在自身受信任发布元数据固定manifest SHA256，在import适配器前先按该清单核验适配器字节**；调用配置函数继续传`expectedManifestSha256`核验外部pin及全清单。自带manifest只能证明内部一致，不证明来源真实性。禁止启动时从网络自动执行最新脚本。`--allow-dirty`/`allowFixtureBundle`只供fixture构建，不能冒充固定发布版。

兼容范围：原Gateway v1，Node>=18；实际验证版本在本轮changes/证据中记录。Harness配置以当前已安装官方schema核对，不把历史103通过当47当前全能力验收。生产令牌/付费生成/部署不是本轮fixture通过的隐含结论。
