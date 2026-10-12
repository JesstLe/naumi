# 生图 SaaS Skills

## 目标和边界

用户纠正：只参考生图/设计 SaaS，不找通用 Agent。选定 Lovart；Manus 研究停止且未实现。
仅在 `codex/agent-skills-20261012` 的独立工作树开发，其他 Agent 负责合并上线；本任务不发布。

## 实查依据（2026-10-12）

- https://www.lovart.ai/zh/designers ：保存创意流程为自定义 Skills，复用于新项目。
- https://www.lovart.ai/zh/docs/getting-started/how-lovart-works ：Skills 为串联提示词、模型的创作工作流，不是脚本市场。
- https://www.lovart.ai/zh/docs/how-to-prompt/agent-skills#aa9126e0113d ：新项目空输入区推荐、输入框左下角技能入口、分类选择、补需求/参考图、按步骤真实交付。
- 同页 Custom Skills：由成功对话保存，My Skills 复用与编辑。Lovart 需 Thinking Mode；Naumi 不添加不存在的模式开关。
- 官网博客搜索结果存在，但中文正文未能读取；不以该搜索摘要作为实现依据。未登录竞品、未访问其私有代码。

## 实施模块

1. 图像创作技能目录/个人数据库/API：12 个电商、营销、品牌、社媒流程；个人技能隔离、乐观版本锁、软移除、100 个上限、请求字节限制。
2. Skill Book：浅色分类卡片、搜索、详情、选择与取消、个人编辑、另存内置技能、从本人对话创建可编辑草稿、JSON 导入/导出。
3. 画布与工作台输入区：显式 Skills 入口和已选标签，服务端按 ID/revision 解析，接入现有工具与计费，记录本轮使用版本。

不实现通用 SKILL.md/ZIP/GitHub/脚本运行。没有新增模型、价格或自动执行权限。对话创建提取用户要求为可编辑草稿，不伪称由模型自动总结出已验证流程；需用户审阅保存。现有鉴权、计费、供应商参数约束均保持。

## 进度

初始 base/main：3c36894cbc4e0c8a5683d20d9ea89bff67ffb4b3。开工重新 fetch，main 未变化。
已实现目录和服务端，UI/集成及集中验收进行中。功能迭代计数待三个模块完成后同步归零。
测试使用本机独立数据库和供应商模拟器；不将模拟生图记为真实供应商验收。

## 接口与执行链

- `GET /api/image-skills`：内置+本人技能；private/no-store。
- `POST`：创建；`PATCH`：按 selection.id/revision 修改；`DELETE`：带版本软移除。
- `POST {action:"conversation-draft",sessionId}`：读取服务器保存的本人对话，仅提取最近六条用户要求，排除助手工具轨迹。
- Skill JSON 导入先呈现编辑草稿，由用户保存；导出只含技能定义，无账号、Cookie、模型密钥或工具返回数据。
- 两个输入区传 `{skill:{id,revision}}`；服务端不接收客户端 instructions。请求解析后冻结工作流，发生修改返回409要求重新选择，删除/跨账号返回404。
- Runtime 的 contextStamp 纳入技能版本；切换版本重建上下文，等待旧持久化完成，再从服务器历史恢复。画布 canvas_turn 和工作台 image_skill 记录名称和版本。现有收费预检及供应商参数约束保持。
- 生图是真实工具调用架构：generate_image、generate_suite、retouch_product、recolor_product 等。选择技能本身不生成、不扣费、不覆盖当前输入内容；用户发送需求后才运行。

## 当前集中验收结果

- `scripts/verify-image-skills.ts`：69项，真实独立 PostgreSQL 与签名认证 API；账号隔离、版本锁/并发修改、请求大小、导入字段、从本人会话提取和软删除通过。
- `scripts/verify-image-skills-execution.ts`：复用已有完整画布模型/计费隔离 fixture，9次供应商模拟请求携带 Skill；真实 Runtime、工具、SSE、媒体/作品数据库、一次4积分扣费和回放不重复通过。不是上游真实消费验收。
- 浏览器实际 localhost /dashboard 与 /canvas：24项；分类/搜索、个人新建/编辑v2、跨入口持久化使用、取消选择、导入/导出、两端流式请求、两端对话草稿、390px表单/卡片、软移除、焦点循环和Escape通过。供应商是本机HTTP模拟器，真实供应商调用0。
- 原Agent会话隔离回归通过；独立基线同样通过原有隔离测试，没有声称基线已具備 Skills。
- TypeScript检查通过；最终正式构建/回滚、Git推送结果待下节记录。

## 交接运行示例

先选择「场景主图」，提供新商品参考图，再发送：

```text
使用这套场景主图流程，把当前商品放在浅色厨房台面，保留瓶身文字和原配色。
先确认缺少的素材；使用后台已配置且支持的画幅与模型，不添加自定义像素尺寸。
```

个人技能库是数据库新增表 app_image_skills，首次访问幂等创建；上线保留两机各自数据库及媒体。不迁移测试账号和测试技能。回滚只还原本模块源码，不删个人技能数据；旧版本忽略新增表。

## 最终交付（2026-10-12）

功能源码提交：6981e8f + a7338bb。三个模块完成后刷新 origin/main，前后 main 均为3c36894cbc4e0c8a5683d20d9ea89bff67ffb4b3，普通合并显示 Already up to date；本任务功能迭代计数归零。交付推送前再核对远端；未切换或覆盖共享主目录。

- 最终69项数据库/API/Runtime检查通过；新增技能取消后系统上下文确实清除，原对话保留，技能版本轨迹真正入库；工作台旧商品附件地址在复用草稿中被替换为本次素材占位。
- 生图执行fixture最终9次Skill供应商请求、一次4积分账务、画布输出/回放/确认门槛通过。真实上游调用0；12种创作配方不等于12项真实供应商逐项出图验收。
- 24项浏览器检查通过；正式standalone在127.0.0.1:13065实际启动，/dashboard、/canvas和认证Skills API通过。成品server.js存在，产物内代码source commit为a7338bb。版本API在该测试启动未注入SOURCE_COMMIT而返回空commit，不把它作为线上版号证据。
- 正式Next构建退出0，开启类型检查和lint；本任务文件单独lint零警告。项目全量lint含已有非本任务警告，未擅改同事模块。
- 回滚在另一份源码副本实际执行，15个变更文件恢复/删除且哈希与初始archive完全一致；Agent会话隔离回归再次通过。任务分支和MODIFIED_FILE保持新增Skills行为，个人数据库不删除。
- 四个证据文件位于 E:/Workspace/naumi/output/image-skills-20261012：MODIFIED_FILE.zip、DIFF_FILE.diff、VERIFICATION.txt、ROLLBACK.sh。baseline archive和逐文件SHA256另存，ROLLBACK.sh只触碰本任务名单且拒绝覆盖后续新改动。
- 浏览器截图 skills-desktop.png、skills-mobile.png；测试日志和browser-checks.json均在同一目录。
- 未连接/发布任一服务器，未合main；后续发布Agent先刷新main/同事分支，整合本分支后按各机发布锁和独立数据库约定上线。

验收口径：创作系统实际链路已用隔离测试和模拟供应商验证，生产付费供应商效果需上线Agent按真实配置进一步验收。无需新增脚本执行环境或接入新上游。
