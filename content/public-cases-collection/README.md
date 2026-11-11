# 公开创作案例内容包 · 2026-11-11

## 当前批次

- 候选 1,410；编辑与媒体核验入选 **384**：图片 **259**，视频 **125**。
- 视频由 119 段独立公开生成短片、3 集完整动态漫、2 部完整 3D 叙事动画、1 部真人科幻短片组成。
- 本目录只保存内容数据、编辑记录、许可依据与证据；不包含模板页、首页或视频工作台业务修改。
- `catalog.json` 与父线程 `CreationCase` 接口同结构，使用独立 `pc-*` ID 和 `/creation-cases/collection-20261111/` 媒体命名空间。
- 大原件、Parquet/ZIP、浏览媒体、离线查看器和可直接交接的 ZIP 位于本工作树 `output/public-case-collection/`，不进 Git。

## 来源与实际入选

| 来源 | 候选 | 入选 | 许可核验层级 |
| --- | ---: | ---: | --- |
| jamez-bondos/awesome-gpt4o-images | 100 | 49 图片 | 固定 SHA，每例 `ATTRIBUTION.yml`，CC-BY-4.0 |
| Rapidata 图片偏好发布 | 272 个去重提示主题 | 210 图片 | 固定数据修订；数据卡明确 CDLA-Permissive-2.0，图片来自数据本体，不是代码许可推断 |
| Rapidata 视频丰富评价发布 | 198 个独立 MP4 | 119 视频 | 固定数据修订；数据卡 Apache-2.0，并明确原始视频所在目录 |
| DiffusionDB 首个分片 | 834 个不同提示主题 | 0 | 图片已提取、解码及缩略，仍待编辑筛选，不混入已入选包 |
| Pepper & Carrot / Morevna Project | 3 集 | 3 动态漫 | 原作者页面交叉链接制作方视频账户；制作方明确 CC-BY-SA-4.0 |
| Blender 开放电影 | 3 部 | 3 叙事短片 | 项目原站共享条款明确成品 CC-BY-3.0，官方分发文件已下载 |

### 固定修订

- GPT-4o：`3ed4dbb0f1ae6f7385c81e1fcea48d9eefd2e596`。
- Rapidata 图片：`5045367fb66da08dfdb1cbd225d74e35e57899b4`。
- Rapidata 视频：`36c4a5925f6f3f3cbebf0d84e8238ed816873d1b`。
- DiffusionDB：`fb620fbe49fa4420e0734bd9c0df11f51176b61f`。
- 动态漫和开放电影无固定 Git 媒体修订；保存下载时间、原始 SHA256、发布者依据快照。动态漫另与 Archive 文件 MD5 逐条核对。

## 文件契约

- `catalog.json`：供父线程选择性接入；不依赖父线程未提交源码运行。
- `verified-cases.json`：完整溯源、原始 SHA256、尺寸、时长、许可依据、媒体核验、提示词来源及编辑审核。
- `candidates.json` / `candidate-status.json`：候选池与逐项状态；未入选不算有效案例。
- `cases.csv`：适合人工复核的 UTF-8 BOM CSV。
- `editorial-decisions.json`：画面审核及中文方法，不是机器按分数自动收录。
- `exclusions.json`：父线程 18 个 ID、原始素材 SHA256/URL、旧模板 353 个 ID/媒体 URL/提示词指纹。
- `existing-media-audit.json`：旧库媒体 294 VERIFIED、59 UNKNOWN。成功项与新图执行原始/像素/感知指纹比对；UNKNOWN 不冒充已完成像素去重。
- `dedup-report.json` / `perceptual-dedup-review.json`：内部、旧库及视频前中后帧去重；当前近似重复命中 0。
- `link-audit.json`：媒体链接与许可依据链接分别检查；292 个不同 URL 均 ACTIVE。一个 Parquet 链接内含多张图，不能把 URL 数当案例数。
- `media-verification.json`：全量入选媒体检查；图片/Pillow 解码、视频 ffprobe 与完整 ffmpeg 解码、H264 faststart。
- `source-evidence/`：逐例署名、数据卡、电影共享条款、制作方视频声明及原漫画交叉链接。
- `catalog.baseline.json`、`catalog.diff`、`VERIFICATION.txt`、`ROLLBACK.sh`：空基线、真实差异及副本回滚证据。交付目录保持有内容，回滚仅对另外的副本测试。

## 提示词与原成品的边界

1. `originalPrompt` 是原来源原样文本；传统电影和动态漫未声明文生视频提示词，值为 `null`。
2. `prompt` / `naumiPrompt` 是按实际画面写的中文改写，标注 `editorial-rewrite-not-reproduction`。
3. **全部 `naumiGenerationVerified=false`**。本任务未调用生成接口、未产生付费生成，也未合成图片冒充公开成品。
4. 动态漫另附 `storyBeats`、`shotPrompts`、原漫画对白摘录及出处；对白摘录不是原片逐字听写。
5. Rapidata 署名写数据发布者，明确单图/单片创作者未署名，不虚构个人作者。来源许可核验是对发布者的明确媒体/数据声明核验，不是作品所有外围权利的无条件承诺。
6. GPT-image-1 子目录的 NOTICE 已单独保存；本批没有采用该子目录。2 例署名文件与 case 身份冲突隔离；3 例另待品牌/角色的二次权利审查。

## 短剧 / 漫剧

- `pc-story-pepper-carrot-03`：秘密原料，205.056 秒；完整动态漫。
- `pc-story-pepper-carrot-04`：灵光药水，215.041667 秒；完整动态漫。
- `pc-story-pepper-carrot-06`：药水大赛，454.937663 秒；完整动态漫。
- `pc-story-big-buck-bunny`：634.6 秒；完整 3D 喜剧短片。
- `pc-story-sintel`：888.032 秒；完整 3D 叙事短片。
- `pc-story-tears-of-steel`：734.166667 秒；完整真人科幻短片＋CG。

完整故事一部/一集只算一个案例，不按镜头、语言配音或清晰度重复计数。6 部叙事作品均保留完整片尾和音轨。其余 119 段写明是短镜头/演示，不冒充完整短剧。现有真人案例是横屏科幻短片，不是竖屏连续微短剧。动态漫第6集 Archive 镜像写 BY-SA3.0，制作方账户明确 BY-SA4.0；保留冲突依据，采用制作方声明。

## 本机续跑

依赖：Python 3.10+、Pillow、PyYAML、pyarrow、ImageHash、NumPy、ffmpeg/ffprobe。Windows 联系表使用 `C:/Windows/Fonts/msyh.ttc`。依赖版本见 `runtime-versions.json`。

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts/content/collect_public_cases.py discover
python scripts/content/collect_public_cases.py media --video-limit 150
python scripts/content/collect_public_cases.py sheets
# 只有在实际打开新的联系表后才增加 editorial-decisions 中的 accept。
python scripts/content/curate_public_cases.py
python scripts/content/curate_public_videos.py
python scripts/content/curate_narrative_cases.py
python scripts/content/collect_public_cases.py export
python scripts/content/audit_public_case_links.py
python scripts/content/enrich_public_case_evidence.py
python scripts/content/collect_public_cases.py export
python scripts/content/collect_public_cases.py verify
python scripts/content/test_public_case_collection.py
python scripts/content/build_public_case_package.py
```

请求全局节流、最多 3 次有限重试、失败回执与 `.partial` 原子文件保存在 output。下载缓存用于断点续跑，不重新请求已取得大媒体。正式入选源文件 SHA256 复核不通过时停止交付。

### 剩余断点

- 834 个 DiffusionDB 候选仍待编辑画面筛选；已解码不等于已入选。
- 48 个 Rapidata 视频尚未下载（当前选择150个做媒体核验）；150中119入选、31未选。
- GPT 来源2条身份冲突、3条二次权利待核验；不要批量解除状态。
- 旧模板59条媒体仍 UNKNOWN；取得原件后重跑指纹交叉核验。
- 独立美妆成套、A+整页、竖屏真人连续短剧仍值得定向扩源，不能把商品单图或横屏短片改名当作这些缺口已经补齐。

## 接入与署名

把交付包 `public/creation-cases/collection-20261111/` 按同名路径接入媒体托管，只合并 `catalog.json` 中明确选择的条目；保留每条 `source`、完整 `ATTRIBUTION.json` 和变更说明。图片 WebP 最大1280×1440不裁切；短视频 H264、faststart，默认无音轨；叙事版最大宽720并保留音轨。离线查看器视频 `preload=none`，不会批量预载影片。

CC-BY 保留作者、来源、许可和变更说明；动态漫媒体改编保留 BY-SA4.0 条件、完整片尾与制作方署名。下载包中的代码、JSON与各媒体的许可不是同一回事，不能改成统一代码 Apache 许可。

本线程未修改共享 checkout、父线程接入文件或页面业务文件；未合 main，未连接47/103，未部署。
