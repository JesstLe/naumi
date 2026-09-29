# 历史标识清理（2026-09-29）

## 范围

- 清理当前 Git 工作树中的历史产品名、旧内部邮箱、旧容器数据库默认值和旧文档标识。
- 默认操作者邮箱统一到 `operator@naumi.local`。
- 新部署的 PostgreSQL 用户、数据库和默认连接串统一使用 `naumi`；仍允许通过环境变量覆盖。
- 发布脚本从正在运行的数据库容器读取用户名和数据库名，避免升级既有实例时依赖硬编码值。
- 旧安装若仍使用 `operator@*.local` 合成邮箱，服务端可识别其现有账户，避免历史作品与积分失联。

## 验证

```powershell
node scripts/removed-identifier-smoke.mjs <removed-identifier>
npm exec tsc -- --noEmit
npm run lint
npm run build
docker compose config --quiet
git diff --check
```

扫描覆盖所有 Git 跟踪文件的文件名和文本内容；二进制文件只检查路径。
