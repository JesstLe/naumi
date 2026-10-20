/** The reverse-Hub protocol's actual enum, not a global canvas restriction. */
export const REVERSE_HUB_IMAGE_RATIOS = ["21:9","16:9","3:2","4:3","1:1","3:4","2:3","9:16"] as const;
export const REVERSE_HUB_RATIO_MESSAGE="当前模型支持1:1、3:4、4:3、2:3、3:2、9:16、16:9、21:9；请明确选择比例，或选择支持原图画幅的模型";
export function unsupportedReverseHubRatio(ratio:string,adapter?:string){return adapter==="reverse-hub"&&ratio!=="auto"&&!(REVERSE_HUB_IMAGE_RATIOS as readonly string[]).includes(ratio);}
