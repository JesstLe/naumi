# 画布新版静态 JS 404：发布漏项修复

## 原因与责任

报价修复版 `af22c6e5f149215cfd5bf862f781e95e67c88987` / `1792808190` 上线后，公网 HTML 引用新版 JS，但 Nginx `location ^~ /_next/static/` 仍从既有主机静态目录服务。此前只把旧静态文件补进新容器，漏将新容器资源发布到该主机目录。用户报告的7个路径公网均404，直接访问同一Web端口均200。上轮版本、健康、接口、服务恢复成功不足以证明前端完整加载，属本轮发布验收漏项，不归因用户浏览器或蓝绿选择。

实际 alias：`/var/www/naumi-assets-compat/release47-no-user-20261023-r1-pricing-e609-r1/_next/static/`。

## 实际修复

- 原三锁内，从固定在线镜像导出静态树505文件，预比对不可变同名文件，仅原子增补缺失42文件。
- 原2754文件SHA256全部保持，旧页面资源不删除/覆盖；Nginx配置及其SHA保持，Web/Worker不重启，端口/运行版本/秘密/DB/媒体均不改。
- 原恢复manifest及canonical继续匹配；修复后三锁释放、恢复service exit0。
- 本任务直接发布器 `output/canvas-model-pricing-fix-20261024/direct-release.py` 已补齐“打开admission前同步实际Nginx静态alias并核对哈希”的步骤，py_compile exit0；没有为此再执行线上发布。

## 实际验收

- 用户7个JS URL：从公网404全部恢复200，MIME为application/javascript。
- 已登录 `/canvas` HTML引用34静态地址，加本轮新增路径及用户7地址去重共69：全部200且响应SHA256与发布文件一致。
- Windows外部客户端独立读取用户7地址：全部200、JS类型正常。
- T3实际浏览器匿名访问 `/canvas?v=1792808190`：JS已执行并渲染登录界面；34静态请求全部200，静态404为0。未登录billing/catalog401单独记录，不说成全请求0错误；未冒称已登录画布完整生成验收。
- 独立硬链接副本只删除42新增文件，原2754hash恢复，live新增文件仍保持。字面结果：`STATIC_ROLLBACK=PASS COPY_ONLY=1 REMOVED=42 BASELINE_HASHES_RESTORED=2754 LIVE_CHANGED=0`，exit0。

## 证据与后续操作

完整命令、输入、字面输出、退出码、原始哈希及差异：`output/canvas-model-pricing-fix-20261024/static-404/VERIFICATION.txt`；同目录保留 `MODIFIED_FILE.json`、`DIFF_FILE.patch`、`ROLLBACK.sh`、`EXTERNAL_SEVEN.json`、`BROWSER.json`。远端原件位于 `/opt/naumi-staging/evidence/canvas-model-pricing-20261024/static-404/`。ROLLBACK为已执行的远端副本验证脚本，不对线上执行。

以后发布时必须同步实际静态资源服务路径，并读取真实HTML引用、核对公网响应，而不以容器内文件存在或health200替代。该步骤属于运维发布完整性，不新增用户确认、限额或业务拦截。
