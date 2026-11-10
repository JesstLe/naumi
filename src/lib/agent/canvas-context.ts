export type CanvasAgentContext = {
  /** Optional reference; empty for text-only conversations. */
  anchorId: string;
  imageUrls: string[];
  imageModelId?: string;
  ratio: string;
  resolution: string;
  quality: string;
  video?: {projectKey:string;nodeId?:string;textNodeId?:string;revision?:number};
};

export const CANVAS_VIDEO_WRITE_TOOLS=new Set(["prepare_video_audio_review","review_video_storyboard_audio","recover_video_audio_review","generate_dialogue_speech","transcribe_dialogue_audio","recover_dialogue_audio_operation","adopt_dialogue_audio_operation","prepare_video_review_frames","review_video_storyboard_take","create_video_node","set_video_config","set_video_prompt","set_video_references","generate_video","extend_video","edit_video","plan_video_shot","plan_video_storyboard","plan_video_script","save_video_storyboard","fork_video_storyboard","apply_video_storyboard_roughcut","apply_video_storyboard_structure","restore_video_storyboard_structure","save_video_timeline","render_video_timeline","adopt_video_timeline","apply_video_storyboard_dialogue","run_video_workflow","resume_video_workflow","confirm_video_workflow_stage","cancel_video_task","cancel_video_workflow","process_video","cancel_video_media_task"]);

export const CANVAS_IMAGE_TOOLS = new Set(["generate_image", "recolor_product", "retouch_product", "replicate_hot"]);
