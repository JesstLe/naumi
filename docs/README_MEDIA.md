# README 展示图片来源

## 本次更新（2026-10-13）

- README 功能说明按刷新后的原仓库 main `47824d64731033c4ac77cf734d36fe0ffa34b854` 及其源码核对。
- 展示图片为103站点实际浏览器截图，显示版本 `2026.10.13-110509`；这两种版本标识分别代表源码基线和截图实例，不能混为同一次发布。
- 使用浅色界面；画布为已有验收项目，Skills菜单为实际12项精选创作技能，工作台示例为实例已有示例。本次没有生图供应商调用。
- 对截图仅进行确定性裁切、等比留边与JPEG压缩：去掉含账号余额的公共导航，生图页另外排除私人历史栏；没有重绘或伪造控件。
- 本次没有修改 `public/demos`、工作台示例目录、应用代码、生产数据或服务器版本。
- 旧README引用的三个PNG已替换，原内容与SHA256保存在本任务忽略输出中以供回滚。

| 文件 | 当前页面 | 尺寸 |
|---|---|---|
| [batch-20261013.jpg](screenshots/batch-20261013.jpg) | `/batchshot` | 1280 × 720 |
| [canvas-agent-20261013.jpg](screenshots/canvas-agent-20261013.jpg) | `/canvas` | 1280 × 720 |
| [generate-20261013.jpg](screenshots/generate-20261013.jpg) | `/generate` | 1280 × 720 |
| [home-20261013.jpg](screenshots/home-20261013.jpg) | `/` | 1270 × 3139 |
| [skills-20261013.jpg](screenshots/skills-20261013.jpg) | `/canvas Skills` | 1280 × 720 |
| [tools-20261013.jpg](screenshots/tools-20261013.jpg) | `/tools` | 1270 × 1818 |
| [tryon-20261013.jpg](screenshots/tryon-20261013.jpg) | `/tryon` | 1280 × 720 |

完整图片清单、字节数、SHA256与裁切范围：[manifest](screenshots/manifest-20261013.json)。

## 更新图片时

1. 刷新main，核对实际产品页面与实例版号，不使用旧图片假称当前版本。
2. 通过用户授权账号打开演示或验收项目，不提交收费任务、不修改他人作品。
3. 使用浅色界面，移除截图范围中的账号余额、邮箱、凭据与私人历史。
4. 替换图片后集中检查Markdown链接、文件解码、截图布局和移动宽度；文档发布不更新服务器。
