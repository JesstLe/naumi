# 分镜成片拼接保声

## 模块与职责

- 基线：`2e79509754542ce620e22be62e24721d6ae47487`；任务工作树 `E:/Workspace/naumi-storyboard-flow-20261102`。
- `scripts/video-fusion/media-engine.mjs` 的 `concat` preset 负责实际 FFmpeg 硬切拼接，不承担分镜调度、上游生成、作品归属或计费。
- `parseProbe` 保持既有 `durationSeconds` 总媒体时长语义，另返回 `videoDurationSeconds`；后者依次读取 FFprobe 视频流 duration、duration_ts/time_base、Matroska DURATION 标签或实际帧数/帧率。没有真实视频时长时返回 null。
- `presetMediaCommand` 消费已验证 probe，仍只输出 asset/output 虚拟路径；媒体 Worker 沿既有 owned bytes/SHA 检查、重新 probe、命令校验、输出完整解码和新作品保存路径。

## 本次实现

旧代码要求每段都有音轨才保留声音，任一无声段会让整片无声；音频尾部比画面长时也会推迟后续切点。

1. 任一片段有声时，整片输出立体声音轨。
2. 无声片段用 `anullsrc` 补与本段视频等长的静音。
3. 有声片段统一 48 kHz/stereo；音频短于画面时用 `apad` 补齐，长于画面时用 `atrim` 截至视频结束。
4. 所有 `anullsrc`/`apad` 都经有界 `atrim`，避免无限音频导致处理永不结束。
5. 所有片段都无声时，继续输出无音轨视频。原有尺寸补边、25 FPS、硬切顺序与 MP4 输出保持。
6. 旧缓存 probe 可能尚无 `videoDurationSeconds`，入队前参数校验仅在该字段不存在时沿用旧 duration；实际 Worker 总会重新 probe。明确 null/0/NaN/Infinity 视频时长会拒绝，不把未知长度当无限静音。

没有覆盖原片段、没有更改权限/URL校验、没有数据库迁移或收费任务重放。

## 集中验证

脚本：`scripts/verify-storyboard-audio.mjs`。

验证使用完整实际 `MediaEngine`、本机 FFmpeg/FFprobe、原始生成测试视频和实际 PCM 解码，不是仅检查命令字符串。构造有声/无声/有声、短音轨、长音轨、5.1声道、不同视频尺寸与 Matroska 标签时长。用时间窗 RMS 与频谱验证保声、静音及下一段切入位置；输出完整解码与原媒体 SHA 保持另有断言。

```text
CWD: E:/Workspace/naumi-storyboard-flow-20261102

node scripts/verify-storyboard-audio.mjs --baseline
STORYBOARD_AUDIO=REPRODUCED CHECKS=2 MIXED_AUDIO_STREAMS=0 VIDEO_TIMELINE_EXTENDED=1 REAL_FFMPEG=1 SUPPLIER_CALLS=0
exit 0

node scripts/verify-storyboard-audio.mjs
STORYBOARD_AUDIO=PASS CHECKS=27 MIXED_AUDIO=RETAINED SILENCE=PADDED LONG_AUDIO=TRIMMED SURROUND=STEREO ORIGINALS=UNCHANGED REAL_FFMPEG=1 SUPPLIER_CALLS=0
exit 0
```

`node --check` 两个脚本及 `git diff --check` 通过。完整 tsc、真实 App/DB/媒体账务及分镜制作链验证由主任务集中运行，本切片不独立提交或发布。

## 可复核证据与回退

证据根：`E:/Workspace/naumi/output/storyboard-flow-20261102/audio/`。

- `baseline/RESULT.json`、`modified/RESULT.json`：测试输入、全部实际命令、退出状态、原始 probe、PCM量化结果及模块哈希。
- `MODIFIED_FILE.mjs`、`DIFF_FILE.patch`、`VERIFICATION.txt`、可执行 `ROLLBACK.sh`：此媒体引擎单文件切片证据；主线程另打整任务包。
- Copy-only 回退在 `ROLLBACK_COPY` 上恢复原 hash，字面结果 `ROLLBACK=PASS RESTORED=1 MODIFIED_FILE=UNCHANGED`，exit0；再次执行原问题行为测试复现2项，exit0。
- 回退只恢复独立验证副本；任务源保持修改，原媒体与业务数据不受影响。

## 边界

- 此处只验证本地媒体处理，未将其等同于47发布、真实上游视频生成或全制作链上线验收。
- 默认输出仍是25 FPS硬切；没有新增字幕、配乐、转场或多轨剪辑。
- 仅首条音轨进入原有拼接路径；多语言/多音轨独立保留不在本次变更中。
- 本轮按用户决定只交付代码、测试并合 main，47继续暂缓发布。
