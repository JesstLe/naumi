# G15-E 代理入口、跨版本切换与生命周期观察

## 目标和边界

保留原`/preview.html?v=4`入口方向与原HTML。复用已有Naumi `/api/internal/release/status|control`、HTTP preload和工作流 `/internal/lifecycle/*`协议，不创建另一套生产发布状态机，不改变根本地release-lifecycle状态或跳过部署锁。

本阶段交付纯代理配置生成器、退休条件观察适配器，以及实际Nginx/完整生产镜像的隔离验收。观察器不执行生产停止或宣称COMPLETE。当前Naumi全量已接受任务、Agent会话、Worker租约覆盖仍不完整，真实观察保留null和HOLD。

## 代理配置契约

`scripts/enterprise-production/proxy-contract.mjs`导出`renderEnterpriseProxy`。输入：publicOrigin、listenPort、webPort、slot、revision；端口、Origin、slot及未知字段严格核验。输出包含plan、planSha256、configSha256和完整配置文本，不直接安装或reload。

- 仅监听本机回环；本轮验收HTTP，真实HTTPS需要目标站TLS前端及外部地址验证。
- `/preview.html`代理到同一Web的`/enterprise/workflow`，保留其他正常Web路由；没有改成/admin壳。
- 固定Host/X-Forwarded-Host/Proto，拒绝不匹配的原始Host；不覆盖客户端Origin，保留应用跨站拒绝。
- 将已知上游回环地址的登录Location重写为明确公共Origin，避免登录跳向内部端口。
- 禁止代理公开内部发布/生命周期控制路径，清除公开请求中的发布控制秘密头。
- 请求和响应缓冲关闭，支持在途上传/流；proxy_next_upstream关闭，不自动重试状态不明的写请求。
- `/_next/static/`从独立只读静态目录读取，包含新旧两个版本；同路径异字节拒绝合并。保留MIME类型与nosniff，不只验证资源200。
- 访问日志只记requestId、路径、实际upstream和状态，不记Cookie、请求体或查询参数。通过requestId核对实际上游地址，不仅相信槽位响应头。

配置是专用组件的完整配置，不能直接覆盖已有生产Nginx多站点配置。正式执行器须按原发布协议核验完整nginx -T、路由/执行图和其他站点，持全程部署锁后整合。生成器的单文件hash不代替完整生效配置hash。

```javascript
import {renderEnterpriseProxy} from './scripts/enterprise-production/proxy-contract.mjs';
const candidate = renderEnterpriseProxy({
  publicOrigin: 'http://127.0.0.1:18482', listenPort: 18482,
  webPort: 18520, slot: 'green', revision: 2,
});
// 此调用只生成文本。实际端口/版本由部署清单提供；不能直接覆盖现有18482服务。
```

## 生命周期观察

`judgeEnterpriseRetirement`输入实际Web和工作流状态、预期实例/boot/commit/release元组、接收时间。只接受新鲜观察和真实数字0，false/字符串0/null不当作0。分别检查HTTP、全量已接受任务、Agent、Worker租约、未知租约、准入覆盖，以及工作流是否真正drained。

结果为HOLD或READY_FOR_OUTER_REVIEW，后者也不等于发布完成。来源仍是已有外层生命周期工具和站点锁。观察器不把trackedAcceptedWork=0推断成acceptedTasks=0，不把传输结束推断成所有后台任务结束。

修复已有`transportObservation`读取器硬编码3002的问题：现在读取`NAUMI_RELEASE_HTTP_CONTROL_PORT`，未配置保持3002；非法端口不发请求，身份不匹配继续未验证。多槽使用同网络命名空间时必须选择不同控制端口；旧固定版本仍可以使用其原3002，不修改旧镜像。

## 实际验收流程

原生产组合验证器新增可选`--proxy true --baseline-report PATH`，普通模式保持原行为。选择上一轮已验收固定镜像作旧版本，当前提交构建新Web/API；两套各自使用实际Image ID，源库/工作流库/交付目录共享合成测试数据。正式交付报告须显示两个不同完整Git提交，不能把开发态相同HEAD标签当作跨提交证明。

1. 启动旧槽与唯一候选Web、新旧工作流API、固定摘要Nginx和隔离驱动，不发布宿主端口。
2. 独立复制新旧`.next/static`，逐文件hash检查同名冲突，生成静态清单hash。
3. 真实渲染原生登录入口；按原逻辑跟随/sign-in到首页登录弹窗，逐次校验公共Origin。记录登录HTML引用的静态资源字节/MIME。
4. 原生口令登录后进入原界面和工作流；一个上传只发送前段，确认旧Web已接受。
5. 错误Nginx配置先`nginx -t`拒绝，原配置hash保持；正确候选校验后替换、reload，并通过新请求ID和access log证明实际路由到新Web。
6. 过期expectedHash拒绝替换，保留当前配置；旧上传继续完成，不停止旧Web或提前drain它后面的API。
7. 新槽继续完成交付、验收、签收及贡献；再次核对旧静态资源的字节/MIME。
8. 复用原Web控制协议执行drain/resume观察，不篡改其覆盖字段。旧版仍有未知全局计数时，适配器持续HOLD。
9. 将入口切回旧版，验证新版本写入的任务/交付/贡献及原积分记录仍可读取，不回灌数据库、不重放已接受任务。

每次配置阶段保存完整nginx -T及hash，记录蓝→绿→蓝三个实际上游和配置revision。配置发布锁/CAS代码仅存在于唯一标记的fixture工具中，不是绕过现有生产状态机的通用发布入口。真实reload结果未知时仍应按既有协议保留UNKNOWN并核对现场，不靠删除状态文件重试。

## 调研与修复记录

- 首轮实际观察发现读取器忽略配置端口，HTTP计数一直未验证；已修复，默认/自定义/非法端口及boot拒绝单元测试通过，真实候选端口验证。
- 用全局NODE_OPTIONS注入preload会令docker exec的诊断Node再次抢占控制端口。测试改为只在Web主进程`node --require ... server.js`加载已有preload，诊断不重复启动观察器。
- 完整SSR页面还需要既有VIDEO_WORKER_SECRET和已配置站点状态。测试生成独立秘密并通过现有设置函数初始化合成管理员密码哈希，没有关闭配置门禁或添加假供应商密钥。原公司密钥应保持稳定，不用fixture值替换。
- /sign-in本来就是兼容跳转入口；测试遵循实际有界跳转，不强行把它改成200页面。
- Web内恢复扫描在测试中显式关闭，独立Naumi Worker并未因此验收。其租约和交接仍未知，不能据此批准旧槽退休。

Naumi Web需要原有正常数据库权限完成登录审计等写入。组合预检使用只读事务，不代表运行Web应改用只读账号；示例占位符已改为NAUMI_WEB_USER。

## 当前状态和后续

开发态实际13组组合场景通过，旧登录入口23个资源前后字节和MIME一致；观察到Web在途1而API在途0，阻止提前停止，随后数据保持的切回通过。最终跨提交固定镜像、完整类型/旧模块回归、镜像交付和代码副本回滚以VERIFICATION.txt为准。原始失败日志保留。

当前全局退休结论仍为HOLD：acceptedTasks、agentSessions、workerLeases及全准入覆盖有未知项。成功的fixture清理只代表本轮受控请求结束后的测试资源清理，不代表生产旧槽已获退休许可。

尚待：目标站TLS/完整路由与Next旧客户端协议、Agent/原Worker/后台任务全覆盖证据、4核8GiB实际及双槽容量、真实公司身份/权限/外部连接。原18482服务、schema8原表与附件保持；总目标ACTIVE。
