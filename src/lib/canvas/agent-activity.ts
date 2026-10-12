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

export function agentActivityLabel(busy: boolean, outcome: string, steps: {tool?: string; status: string}[], english = false, responding = false): string {
  if (!busy) return ({done: english ? "Done" : "已完成", error: english ? "Failed" : "未完成", stopped: english ? "Stopped" : "已停止"})[outcome] || "Agent";
  const running = [...steps].reverse().find(step => step.status === "running");
  if (running) return (english ? "" : "正在") + agentToolLabel(running.tool || "", english);
  if (responding) return english ? "Replying" : "正在回复";
  return steps.length ? (english ? "Processing next steps" : "正在处理后续步骤") : (english ? "Processing request" : "正在处理请求");
}

export function agentElapsedLabel(milliseconds: number, english = false): string {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${english ? "Waiting " : "已等待 "}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
