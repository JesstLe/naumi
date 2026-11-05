export type CutoutInput = {
  bytes: Buffer;
  type: string;
  email: string;
  parentId: string;
  title: string;
  category: string;
  ratio: string;
  resolution: string;
  // 用户在前端选的质量档:fast=极速(自托管)/ fine=发丝级(Replicate)/ ""=用后台默认
  quality: "fast" | "fine" | "";
};
