# 文档与源码证据核验

## 固定输入

- BASE：`3f1aa4a158cfbf47cdfef5e663bc2200ce6fa61e`
- FUSION：`6dd5d51b379ad5b6fe1ed1244c08d239f30c59b5`
- MAIN：`305e1c72ef7e2fd9d594dc6c6e8263386a47c9ea`
- 原34项矩阵：`docs/superpowers/specs/2026-10-13-canvas-video-fusion-design.md`
- 用户原则：`docs/CANVAS_CAPABILITY_ADAPTATION.md`

## 验证方法

以下为文档/源码一致性核验，不启动产品运行时，不访问DB或供应商。

1. `build_inventory.py`：全量比较三个固定Git树，生成全部1,233个净差异路径和1,041个提交；不按日期猜作者归属。
2. `build_capabilities.py`：保留V/P/S原34项并补充9项；对每个源码锚点读取固定main文件、定位行号，校验所列测试文件存在。
3. `build_interfaces.py`：提取当前路由声明、Agent注册、旧/新profile、视频表引用和公开符号；表扫描排除索引名称。
4. `verify.py`：逐文件blob、集合完整性、提交集合、能力ID、源码锚点、接口数量、本地文档链接及业务源码零改动核验。
5. `git diff --check`：提交内容格式检查。

## 命令与终态

执行目录：独立任务工作区 `E:/Workspace/naumi-canvas-fusion-inventory-20261027`；该工作区在合入main后按规则删除。复现时在任何包含上述固定对象的Naumi工作区运行相同相对命令。

```text
python docs/analysis/canvas-fusion-20261027/build_inventory.py
python docs/analysis/canvas-fusion-20261027/build_capabilities.py
python docs/analysis/canvas-fusion-20261027/build_interfaces.py
python docs/analysis/canvas-fusion-20261027/verify.py
git diff --check
```

集中核验已完成，以上五条命令退出码均为0。原始命令日志保留在 `E:/Workspace/naumi/output/canvas-fusion-inventory-20261027/`。

生成器与验证器的字面结果：

```text
FUSION_IN_MAIN=True FUSION_ONLY_COMMITS=0
CAPABILITY_CATALOG=PASS ITEMS=43 ORIGINAL_MATRIX=34 ANCHORS=130 SOURCE_FILES=80 RUNTIME_TESTS=0
INTERFACE_INDEX=PASS ROUTES=29 TOOLS=27 PROFILES_OLD=44 PROFILES_MAIN=53 TABLES=16 EXPORTS=561
DOC_AUDIT=PASS FILES=1233 COMMITS=1041 ORIGINAL_CAPABILITIES=34 TOTAL_CAPABILITIES=43 SOURCE_ANCHORS=130 ROUTES=29 AGENT_TOOLS=27 PROFILES=53 EXPORTS=561 LOCAL_LINKS=15 BUSINESS_SOURCE_CHANGES=0 RUNTIME_TESTS=0
```

全量文件生成器的JSON计数与 [inventory.json](inventory.json) 完全一致；`git diff --check` 无输出。16个表名是扫描范围内SQL表引用，未把4个`_idx`索引误计为表。新增本地链接后验证器的LOCAL_LINKS数可能增加，不影响能力/源码统计。

## 明确未做

- 不执行历史产品测试或收费生成，不把测试文件存在记成测试通过。
- 不核验线上模型目录、容量、API凭据、DB实际状态、当前媒体Worker或服务器运行版本。
- 不启动Director3D、Toonflow或Naumi浏览器，不生成UI截图。
- 不实现新节点、不解除菜单禁用、不发布服务器。

## 再生成注意

固定源文件和对应行号必须一起更新。当前main若继续演进，先保存原报告，再明确选择新审计SHA；只重跑生成器不等于已经重新阅读功能链。
