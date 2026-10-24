import type {ArtworkProvenance} from "@/lib/artwork-provenance";

export type ArtworkRecord = {
  creationProvenance?: ArtworkProvenance | null;
  id: string;
  title: string;
  category: string;
  prompt: string;
  status: string;
  image: string;
  gradient: string;
  createdAt: string;
  style?: string | null;
  ratio?: string | null;
  resolution?: string | null;
  source?: string | null;
  batchId?: string | null;
  parentId?: string | null; // 血缘:这张图基于哪张作品(图生图底图)生成,根图为 null
  parentIds?: string[] | null; // 多输入:这张图额外的父节点(合并多张参考图);含 primary parentId 之外的
  templateId?: string | null; // 若这是"模板原图"根节点,记录它代表的模板 id
  canvasX?: number | null; // 画布手动拖拽后记住的坐标(空=用自动布局)
  canvasY?: number | null;
  width?: number | null; // 原图实际像素宽度
  height?: number | null;
  processingKind?: "base" | "resize" | "native" | "ai-upscale" | "imagegen" | null;
  postprocessStatus?: "succeeded" | "failed-kept-base" | "pending" | null;
  canvasWidth?: number | null; // 无限画布节点显示尺寸；与原图像素分离
  canvasHeight?: number | null;
  groupId?: string | null; // 稳定项目分组:同项目所有节点共享,删节点也不变
  canvasGroupId?: string | null; // 画布编辑分组,不参与项目归属与生成血缘
  origin?: string | null; // 来源场景:"canvas"=在画布里产出(永远留画布);空=生图页/工具等普通产出
  marked?: boolean;
  videoUrl?: string | null; // 视频产物地址(有值=该作品是视频节点;image 存海报帧可空)
};

export type AdminArtwork = ArtworkRecord & { email: string };
