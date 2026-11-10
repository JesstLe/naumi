/** Public action names shared by live progress, restored history and the Agent orb. */
const actions: Record<string, [string, string]> = {
  generate_image: ["生成图片", "Generating image"], recolor_product: ["替换颜色", "Recoloring image"],
  retouch_product: ["精修图片", "Retouching image"], replicate_hot: ["复刻图片", "Creating variation"],
  verify_image_output: ["检查生成结果", "Checking result"], get_balance: ["检查积分", "Checking credits"],
  search_templates: ["查找模板", "Searching templates"], list_my_artworks: ["查找作品", "Finding artworks"],
  generate_suite: ["生成套图", "Generating image set"], generate_aplus: ["生成 A+ 母图", "Generating A+ source"],
  review_aplus_source: ["检查 A+ 母图", "Reviewing A+ source"], continue_aplus_generation: ["生成详情页", "Generating detail page"],
  generate_packaging_3d: ["生成包装图", "Generating packaging"], list_comfy_workflows: ["读取工作流", "Loading workflows"],
  run_comfy_workflow: ["执行工作流", "Running workflow"], list_video_models: ["读取视频模型", "Loading video models"],
  plan_video_shot: ["策划视频镜头", "Planning video shot"], plan_video_storyboard: ["策划分镜", "Planning storyboard"],
  fork_video_storyboard:["建立独立版本","Creating independent version"],
  list_video_storyboards:["读取分镜方案","Loading storyboards"],get_video_storyboard:["读取指定方案","Loading storyboard"],save_video_storyboard:["保存方案与审片","Saving storyboard review"],get_video_storyboard_operation:["查询方案原操作","Checking storyboard receipt"],inspect_video_storyboard:["检查制作与粗剪","Inspecting production"],apply_video_storyboard_roughcut:["保存方案粗剪","Saving storyboard roughcut"],
  plan_video_script: ["保存剧本", "Saving script"],
  list_video_text_nodes:["读取剧本来源","Loading script sources"],get_video_text:["读取完整片段文字","Loading complete scene text"],
  run_video_workflow:["执行视频制作链","Running video workflow"],get_video_workflow:["查询制作链","Checking video workflow"],resume_video_workflow:["恢复制作链","Resuming video workflow"],cancel_video_workflow:["停止制作链","Stopping video workflow"],confirm_video_workflow_stage:["确认阶段报价","Confirming stage quote"],
  create_video_node:["创建视频节点","Creating video node"],get_video_config:["读取视频设置","Loading video settings"],list_video_nodes:["读取视频节点","Loading video nodes"],
  set_video_config:["保存视频设置","Saving video settings"],set_video_prompt:["保存视频描述","Saving video prompt"],set_video_references:["保存视频引用","Saving video references"],
  list_video_assets:["读取媒体素材","Loading media assets"],list_video_workflows:["读取自备视频工作流","Loading video workflows"],cancel_video_task:["请求停止视频","Requesting video cancellation"],
  get_video_timeline:["读取多轨工程","Reading timeline"],save_video_timeline:["保存声音字幕","Saving dialogue and subtitles"],render_video_timeline:["导出声音字幕","Rendering timeline"],adopt_video_timeline:["采用成片","Adopting timeline result"],apply_video_storyboard_dialogue:["读取原稿对白","Reading script dialogue"],
  process_video:["处理视频媒体","Processing video media"],get_video_media_task:["查询媒体进度","Checking media progress"],cancel_video_media_task:["停止媒体处理","Cancelling media processing"],
  get_video_task: ["查询视频进度", "Checking video task"], generate_video: ["生成视频", "Generating video"],
  extend_video: ["续写视频", "Extending video"], edit_video: ["编辑视频", "Editing video"],
  list_agent_tools: ["读取工具目录", "Loading tools"], cutout_image: ["抠图", "Removing background"],
  cutout_avatar: ["提取头像", "Extracting portrait"], upscale_image: ["提升清晰度", "Upscaling image"],
  inpaint_image: ["局部改图", "Editing image region"], transfer_style: ["转换风格", "Transferring style"],
  remove_watermark: ["去除水印", "Removing watermark"], try_on_clothing: ["生成服装上身图", "Creating try-on image"],
  extract_garment: ["提取服装", "Extracting garment"], generate_garment_3d: ["生成服装立体图", "Generating 3D garment"],
  dewrinkle_clothing: ["去除服装褶皱", "Removing wrinkles"], extract_print: ["提取印花", "Extracting print"],
  check_image_ip: ["检查侵权风险", "Checking image rights"], prepare_print_file: ["制作印刷图", "Preparing print file"],
  generate_variations: ["生成图片变体", "Generating variations"], fuse_images: ["融合图片", "Combining images"],
  generate_titles: ["生成标题文案", "Generating titles"], list_competitor_items: ["读取竞品参考", "Loading references"],
  import_competitor_image: ["导入参考图", "Importing reference"], analyze_competitor: ["分析参考图", "Analyzing reference"],
  replicate_competitor: ["生成竞品参考图", "Generating reference variation"], edit_competitor: ["编辑竞品参考图", "Editing reference"],
};

export function agentToolLabel(tool: string, english = false): string {
  return actions[tool]?.[english ? 1 : 0] || (english ? "Running tool" : "执行工具");
}

export function agentToolSummary(summary: unknown): string | undefined {
  return typeof summary === "string" && summary.trim() && !["工具执行完成", "工具执行失败，请查看安全错误提示"].includes(summary)
    ? summary : undefined;
}

export function agentActivityLabel(busy: boolean, outcome: string, steps: {tool?: string; status: string;summary?:string}[], english = false, responding = false, attention?: "waiting" | "restricted"): string {
  if (attention && outcome !== "stopped" && outcome !== "error") return attention === "waiting" ? english ? "Waiting for input" : "等待输入" : english ? "Restricted" : "受限";
  if (!busy) return ({done: english ? "Done" : "已完成", error: english ? "Failed" : "未完成", stopped: english ? "Stopped" : "已停止"})[outcome] || "Agent";
  const running = [...steps].reverse().find(step => step.status === "running");
  if (running) return agentToolSummary(running.summary)||(english ? "" : "正在") + agentToolLabel(running.tool || "", english);
  if (responding) return english ? "Replying" : "正在回复";
  return steps.length ? (english ? "Processing next steps" : "正在处理后续步骤") : (english ? "Waiting for model response" : "等待模型响应");
}

export function agentElapsedLabel(milliseconds: number, english = false): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${english ? "Waiting " : "已等待 "}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
