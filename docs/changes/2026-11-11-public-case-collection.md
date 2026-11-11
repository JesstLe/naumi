# 2026-11-11 公开图片、视频与动态漫独立采集

## 模块与职责

本工作树只负责公开创作案例研究、取得媒体、去重、许可依据、编辑中文方法和离线内容包。代码与内容均位于独立 `codex/public-case-collection-20261111`；初始 HEAD / origin/main 为 `974fa2c2191447771048d84a190cd80449778c3f`。

文件范围：`content/public-cases-collection/`、`scripts/content/`、本文档；原件与浏览媒体在被 Git 忽略的 `output/public-case-collection/`。没有改模板页、首页、视频工作台或父线程的接入文件，没有合 main 或发布。

## 公共接口、依赖方向、数据/状态归属

- `catalog.json` 保持父线程只读查看到的 `CreationCase` 字段结构：id/kind/title/category/tags/poster/width/height/video?/duration?/prompt/steps/source/adaptation。
- 独立 `pc-*` ID 与 `/creation-cases/collection-20261111/` 资源目录，避免父线程第一批18条的ID或媒体路径冲突。
- `verified-cases.json` 保存完整溯源，`candidates.json` 和 `candidate-status.json` 保存候选/失败/未核验状态；明确区分链接活跃、许可声明、媒体完整性与编辑入选。
- 采集脚本依赖标准库、Pillow、PyArrow、PyYAML、ImageHash、NumPy、ffmpeg/ffprobe；不导入 Naumi 业务模块，不调用生成或计费API。
- 下载有限重试、节流、原子文件和持久断点；大原件、解码临时帧、全部研究联系表均由本线程 output 拥有。

## 批次记录与调研结论

### 批次1：扩源与媒体取得

- 从固定 SHA 的 GPT-4o 库得到100例；逐个保存 `case.yml` 和 `ATTRIBUTION.yml`，不是用根许可覆盖所有路径。
- `gpt-image-1/NOTICE-openai.md` 单独保存，本次未使用该目录。
- 两例 identity mismatch：case20与case37的署名文件对应了不同作品，保持 `pending-provenance`。
- Rapidata 图片读取6个固定 Parquet 分片，先按原始图片身份、规范化提示词和偏好记录汇总，再留下272个提示主题，而不是把6000条两两比较行作为案例数。
- Rapidata 视频数据本体198个独立MP4；下载150个，不取GIF标注、热图或对比页；119段编辑入选。
- DiffusionDB首分片提取834个不同提示主题，完成媒体解码及缩略，但尚未编辑入选，发布包计数为0。
- 基础候选池1404，追加叙事6部后最终1410。

### 批次2：画面编辑与去重

- 生成多页缩略图和前中后帧联系表，实际打开5页GPT、14页Rapidata图片、15页独立视频及6页多场景叙事联系表，总计40页。
- 逐项中文标题、类别、画面改写与步骤由编辑决策落盘，未根据上游评价分数自动标成可发布。
- 剔除/暂缓：明显品牌或角色风险、参考小图拼接、画面不适合业务、重复母题、身份不一致。
- 父线程18个ID全部排除：12张原图按URL/原始SHA排除，6个视频的共同Mochi九宫格原片也按原始SHA排除，未再次裁切凑数。
- 旧模板共353条，294条取得媒体并解码指纹，59条 UNKNOWN；保留真实错误，不把不可取得的媒体当成去重完成。
- 入选案例内部原始SHA、解码像素SHA、规范化提示词、图像pHash近似、视频三帧序列比较均无重复命中；新图与294条旧素材近似命中为0。

### 批次3：用户追加短剧 / 漫剧

- 新增3集 Pepper & Carrot 完整动态漫：秘密原料205.056秒、灵光药水215.041667秒、药水大赛454.937663秒。
- 原漫画作者网站分别交叉链接 Morevna 的视频账户；API记录明确制作方、完整标题、时长、文件和 CC-BY-SA4.0。保存原漫画页、制作方记录与镜像记录。
- 第6集镜像写BY-SA3.0，而制作方账户写BY-SA4.0；按制作方明确声明，保留冲突说明，不静默覆盖原证据。
- 新增 Big Buck Bunny、Sintel、Tears of Steel 完整成片：2部3D叙事动画、1部真人科幻短片。原站共享条款明确成品CC-BY3.0，媒体使用官方分发。
- Google样例镜像403，记录失败后选用独立公开的官方分发文件；未绕访问限制。Morevna主站TLS连接失败，原漫画作者交叉链接的公开视频账户可正常核验。
- 叙事作品保留完整音轨和片尾，增加角色/冲突/升级/反转、分镜提示词、工作流与原漫画对白出处。它们是既有公开传统制作成品，不标成Naumi生成、竖屏微短剧或一次生成的长视频。

## 最终真实计数

| 指标 | 结果 |
| --- | ---: |
| 候选 | 1410 |
| 有效编辑入选 | **384** |
| 图片 | **259** |
| 独立生成短视频 | **119** |
| 完整动态漫 | **3** |
| 其他完整叙事短片 | **3** |
| 视频合计 | **125** |
| 真实Naumi生成/付费调用 | **0** |

来源分布：GPT-4o 49图、Rapidata 210图/119视频、Morevna动态漫3、Blender叙事3。类别细分见 `summary.json`，全部25个业务类别没有伪装成同一类商品图。

媒体与许可证据层级：本机取得真实成品→全量解码→人工联系表选择→来源声明与逐项许可依据→本地可接入包。不是应用接入、远端CI、main、部署或线上业务验收。

## 验证命令、结果与交付

```text
python scripts/content/verify_public_case_catalog.py
CATALOG_PASS cases=384 images=259 videos=125

python scripts/content/test_public_case_collection.py
Ran 9 tests ... OK

python scripts/content/collect_public_cases.py verify
result=PASS; cases=384; images=259; videos=125;
allOriginalHashes=PASS; allPostersDecoded=PASS;
allVideosFullyDecoded=PASS; allVideoFaststart=PASS; generationCalls=0

python scripts/content/audit_public_case_links.py
LINK_AUDIT 292 ACTIVE 292 UNKNOWN 0
```

- 入选源媒体、出处页面和许可依据共292个不同URL已分别测量，不把容器URL数/请求数当成果数。
- 384张封面、125个MP4共509个媒体文件；媒体体积506,704,139字节。
- 输出：`output/public-case-collection/delivery/index.html`（离线筛选、原片播放、提示词及来源），`output/public-case-collection/naumi-public-cases-20261111.zip`（仅入选媒体＋JSON/CSV/署名依据）。
- `MANIFEST.json` 对每个交付文件记录SHA256；ZIP重开逐文件CRC检查通过。
- 空基线→384条修改→另一个副本回滚为空的完整命令、输入、literal输出与退出码见 `content/public-cases-collection/VERIFICATION.txt`。`ROLLBACK.sh` 有hash门禁且拒绝修改交付的catalog本体。
- 实际打开检查：内容抽样PNG、6部叙事多场景PNG/JPG及所有入选联系表；不是用空工具输出冒充图片交付。

## 未完成项与下一步

1. 当前有效目标已超过300；不用未核验候选补数。
2. 来源/二次权利待核验5条：身份冲突2，品牌/角色3，保持隔离。
3. 素材候选48个视频未下载，834个DiffusionDB主题未完成编辑选择。127例本批不选，12例父线程已用原图不重复接入。
4. 旧库59条媒体原件未知，继续从有效原件补交叉指纹；当前没有声称全353条像素去重完成。
5. A+整页、成套美妆和竖屏真人连续短剧仍需专门扩源；不把普通单图/横屏短片改名顶替。
6. 父线程从独立内容目录选择接入；本线程只选择性提交并推送内容分支，不动UI、不合main、不部署。

交付前再次 fetch 的 origin/main：`90de225ea193731d2a75b89a6f4065ee74f71178`。本任务只交内容分支，保留起始基线，不在本线程执行主线合并。
