# 新后台历史生成入口与全部日期

## 原因及范围

用户反馈新UI历史图片生成数据似乎消失。此前47只读核对任务/作品仍在；新 `/admin/creations` 默认新台账且最近7天，旧任务藏在折叠筛选中。不是用备份覆盖数据库的任务。

- 独立分支 `codex/admin-history-entry-20261023`，工作树 `E:/Workspace/naumi-admin-history-entry-20261023`，基线 `53a6711effa68e05ba39ad2b415d672dcaf461f8`。
- 只改 creation-browser、新独立导航CSS、creation-contracts/http、legacy-creations，以及测试/文档。
- 不改 `creations.ts` 性能补丁、writer、BI通用日期限制、数据库、企业授权或共享center-shell等18个未提交文件。
- 通知既有47线程文件范围与HOLD协调，本线程无47候选/锁/切流/重启。

## 实现

1. 平台无tenant限定的列表上方常显「新创作 / 历史生成 / 图片作品」，不再在折叠菜单藏来源切换。图片作品仍进入原BI作品页，不冒充任务/新创作同一套数据。
2. 历史切换设置 `source=legacy&period=all`，清除日期、分页和旧详情选择；新创作清除历史period和日期，恢复原最近7天默认。搜索/账号/状态保留，未自动清除用户筛选。
3. 历史无显式日期的请求（含原旧链接 `?source=legacy`）默认全部日期；显式from/to仍生效，列表上方可见当前范围，一键恢复全部日期。
4. `period`只接受all，且只能用于source=legacy、无from/to。新台账的默认7天、原日期上限和普通BI接口不变。历史适配器只在已验证的all请求将BI query start/end设为PostgreSQL `-infinity/infinity`，复用既有先分页后详情SQL，不杜撰固定最早日期。
5. 企业或tenant限定页面不出现全站历史导航，API继续拒绝企业/tenant读取legacy；旧记录不按当前成员关系伪造历史企业归属。
6. 空状态不再把没有新台账误写成“没有已确认归属记录”覆盖历史，分别显示匹配的历史生成/创作记录为空。

新台账与历史保持分区，不自动UNION/补写新台账，避免同一任务重复展示或推断不存在的企业归属。历史任务中的成功图片仍通过原详情/素材路径读取。

## 验证

- 在原真实 `verify-saas-creations.ts` 路由/PG/原生签名鉴权用例中增加2001年旧图像任务。
- BASELINE：`HISTORY_ENTRY_STATE=HIDDEN oldJobVisible=false`，确认原默认历史入口确实隐藏老数据。
- MODIFIED：`HISTORY_ENTRY_STATE=VISIBLE oldJobVisible=true`。无日期/显式all一致；2001单日精确1条；有限日期排除旧任务；all+日期及无效period拒绝；新台账仍默认日期；匿名拒绝，企业/tenant历史拒绝。
- 既有全部创作读取用例继续PASS：跨租户、当前下属、暂停/离职媒体撤权、脱敏、false/0/null、计费去重、UUID批次恢复、后代素材、分页、视频Range、外部素材拒绝。供应商调用0。
- 独立rollback worktree先放入修改产品文件，再执行可执行ROLLBACK.sh：4个原文件SHA256恢复，新CSS移除。注入同一验收脚本后再跑，恢复 `HIDDEN oldJobVisible=false` 且全部原读取验收PASS；任务工作树和MODIFIED_FILE.tar保持修改态。
- T3预览实际组件点击与请求验证：历史切换请求含source=legacy/period=all，翻页保留all，新创作清除all，企业组件无全站历史导航。截图两次原始错误均为 `Preview automation snapshot timed out after 15000ms.`；独立CUA iab返回Browser is not available: iab。
- 因上述截图错误，限定启动新headless Playwright（不附着用户Chrome/CDP）。实际CreationBrowser组件+隔离auth/导航/数据fixture：桌面1280和移动390、切换/翻页/日期复位清旧详情、企业隐藏、无横向溢出、pageErrors0通过；实际截图已打开检查。fixture不算生产全链路验收。
- 完整Next15.5.27 production build exit0（既有lint warning保留）、tsc exit0。
- 首次PG刚启动未就绪导致连接终止，pg_isready通过后重跑通过；浏览器fixture最初返回列表JSON给详情导致组件崩溃，已将fixture详情固定404并复测通过，业务组件未为mock放宽契约。

## 产物及发布

`E:/Workspace/naumi/output/admin-history-entry-20261023/`：MODIFIED_FILE.tar（5个产品文件）、DIFF_FILE.patch、VERIFICATION.txt、可执行ROLLBACK.sh、MANIFEST.json及original/modified字节、BASELINE/MODIFIED/ROLLBACK日志、浏览器fixture截图/记录。

提交前刷新main并核对差异；固定提交推送后交给现有47发布线程整合蓝绿验收。本线程不并行发布，不声称已上线；回滚只恢复产品文件，不回灌DB/媒体、不重放付费任务。本轮功能模块计数1。
