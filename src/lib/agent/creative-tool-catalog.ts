import type { FeatureId } from "../billing/types";

/** Executable coverage of the creation hub; Agent is an entry, not a recursive tool. */
export const CREATIVE_AGENT_TOOLS: Record<string, string[]> = {
  competitors: ["list_competitor_items", "import_competitor_image", "analyze_competitor", "replicate_competitor", "edit_competitor"],
  generate: ["generate_image"], batchshot: ["generate_image"], video: ["list_video_text_nodes","get_video_text","list_video_models","list_video_workflows","list_video_assets","create_video_node","get_video_config","list_video_nodes","set_video_config","set_video_prompt","set_video_references","plan_video_shot","plan_video_storyboard","plan_video_script","list_video_storyboards","get_video_storyboard","save_video_storyboard","fork_video_storyboard","get_video_storyboard_operation","inspect_video_storyboard","inspect_video_storyboard_costs","apply_video_storyboard_roughcut","get_video_timeline","save_video_timeline","render_video_timeline","adopt_video_timeline","apply_video_storyboard_dialogue","generate_video","get_video_task","cancel_video_task","extend_video","edit_video","process_video","get_video_media_task","cancel_video_media_task","run_video_workflow","get_video_workflow","resume_video_workflow","cancel_video_workflow","confirm_video_workflow_stage"],
  suite: ["generate_suite"], agent: [], aplus: ["generate_aplus", "review_aplus_source", "continue_aplus_generation"],
  packaging3d: ["generate_packaging_3d"], replicate: ["replicate_hot"], variations: ["generate_variations"],
  retouch: ["retouch_product"], cutout: ["cutout_image"], avatar: ["cutout_avatar"], recolor: ["recolor_product"],
  upscale: ["upscale_image"], inpaint: ["inpaint_image"], style: ["transfer_style"], fuse: ["fuse_images"],
  dewatermark: ["remove_watermark"], tryon: ["try_on_clothing"], garment: ["extract_garment"],
  garment3d: ["generate_garment_3d"], dewrinkle: ["dewrinkle_clothing"], titles: ["generate_titles"],
  printextract: ["extract_print"], ipcheck: ["check_image_ip"], printfile: ["prepare_print_file"],
};

export const CREATIVE_TOOL_FEATURES: Record<string, {feature: FeatureId; label: string}> = {
  cutout_image: {feature:"tool.cutout",label:"AI抠图"}, cutout_avatar:{feature:"tool.avatar",label:"抠头像"},
  upscale_image:{feature:"tool.upscale",label:"变清晰"}, inpaint_image:{feature:"tool.inpaint",label:"局部改图"},
  transfer_style:{feature:"tool.style",label:"风格转换"}, remove_watermark:{feature:"tool.dewatermark",label:"去水印"},
  try_on_clothing:{feature:"tool.tryon",label:"服装上身"}, extract_garment:{feature:"tool.garment",label:"服装提取"},
  generate_garment_3d:{feature:"tool.garment3d",label:"3D服装图"}, dewrinkle_clothing:{feature:"tool.dewrinkle",label:"服装去皱"},
  extract_print:{feature:"tool.extract",label:"印花提取"}, check_image_ip:{feature:"tool.ipcheck",label:"侵权检测"},
  prepare_print_file:{feature:"tool.printfile",label:"印刷图"}, generate_variations:{feature:"image.generate",label:"图裂变"},
  fuse_images:{feature:"image.generate",label:"AI融图"}, replicate_competitor:{feature:"competitor.action",label:"竞品参考生成"},
  edit_competitor:{feature:"competitor.action",label:"竞品选区编辑"},
};
