"use client";

import { Sparkles } from "lucide-react";
import { imageModelFamily } from "@/lib/image-model-routing";

/**
 * 模型家族品牌图标。SVG 路径数据原样取自 @lobehub/icons v5.21(MIT),
 * 内联内置以避免其依赖链问题;未识别的家族退回通用星芒。
 */

function NanoBananaColor({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-none">
      <path d="M1.5 19.824c0-.548.444-.992.991-.992h.744a.991.991 0 010 1.983H2.49a.991.991 0 01-.991-.991z" fill="#F3AD61" />
      <path d="M14.837 13.5h7.076c.522 0 .784-.657.413-1.044l-1.634-1.704a3.183 3.183 0 00-4.636 0l-1.633 1.704c-.37.385-.107 1.044.414 1.044zM3.587 13.5h7.076c.521 0 .784-.659.414-1.044l-1.635-1.704a3.183 3.183 0 00-4.636 0l-1.633 1.704c-.37.385-.107 1.044.414 1.044z" fill="#F9C23C" />
      <path d="M12.525 1.521c3.69-.53 5.97 8.923 4.309 12.744-1.662 3.82-5.248 4.657-9.053 6.152a3.49 3.49 0 01-1.279.244c-1.443 0-2.227 1.187-2.774-.282-.707-1.9.22-4.031 2.069-4.757 2.014-.79 3.084-2.308 3.89-4.364.82-2.096.877-2.956.873-5.241-.003-1.827-.123-4.195 1.965-4.496z" fill="#FEEFC2" />
      <path d="M16.834 14.264l-7.095-3.257c-.815 1.873-2.29 3.308-4.156 4.043-2.16.848-3.605 3.171-2.422 5.54 2.364 4.727 13.673-.05 13.673-6.325z" fill="#FCD53F" />
      <path clipRule="evenodd" d="M13.68 12.362c.296.094.46.41.365.707-1.486 4.65-5.818 6.798-9.689 6.997a.562.562 0 11-.057-1.124c3.553-.182 7.372-2.138 8.674-6.216a.562.562 0 01.707-.364z" fill="#F9C23C" fillRule="evenodd" />
      <path d="M17.43 19.85l-7.648-8.835h6.753c1.595.08 2.846 1.433 2.846 3.073v5.664c0 .997-.898 1.302-1.95.098z" fill="#FFF478" />
    </svg>
  );
}

function GoogleColor({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" className="flex-none">
      <path d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z" fill="#4285F4" />
      <path d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z" fill="#34A853" />
      <path d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z" fill="#FBBC05" />
      <path d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z" fill="#EB4335" />
    </svg>
  );
}

function OpenAIMono({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="flex-none">
      <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
    </svg>
  );
}

export function ModelIcon({ modelId, size = 16 }: { modelId: string; size?: number }) {
  const family = imageModelFamily(modelId);
  const id = modelId.toLowerCase();

  if (family === "nano-banana-2" || family === "nano-banana-pro") {
    return <NanoBananaColor size={size} />;
  }

  if (family === "imagen-4") {
    return <GoogleColor size={size} />;
  }

  if (modelId.startsWith("gpt-image") || modelId.startsWith("naumi-image")) {
    return <OpenAIMono size={size} />;
  }

  // 文字模型品牌识别:有内联官方 SVG 的直接用,其余用品牌主色首字母徽标。
  if (/^(gpt-|o[134]($|-)|chatgpt|openai)/.test(id)) {
    return <OpenAIMono size={size} />;
  }
  if (/^(gemini|gemma|imagen)/.test(id)) {
    return <GoogleColor size={size} />;
  }
  const letterBrand = textModelLetterBrand(id);
  if (letterBrand) {
    return (
      <LetterBadge
        letter={letterBrand.letter}
        bg={letterBrand.bg}
        size={size}
      />
    );
  }

  return <Sparkles aria-hidden size={size} strokeWidth={1.8} className="flex-none" />;
}

/** 品牌主色首字母徽标(官方 SVG 未内联的品牌兜底,视觉仍强于通用齿轮)。 */
function textModelLetterBrand(id: string): { letter: string; bg: string } | null {
  if (/^claude/.test(id)) return { letter: "C", bg: "#D97757" };
  if (/^deepseek/.test(id)) return { letter: "D", bg: "#4D6BFE" };
  if (/^(qwen|qwq|qvq)/.test(id)) return { letter: "Q", bg: "#615CED" };
  if (/^(grok|xai)/.test(id)) return { letter: "G", bg: "#1D1D1F" };
  if (/^(kimi|moonshot)/.test(id)) return { letter: "K", bg: "#0D1F3C" };
  if (/^(glm|zhipu|chatglm)/.test(id)) return { letter: "Z", bg: "#3859FF" };
  if (/^llama/.test(id)) return { letter: "L", bg: "#0866FF" };
  if (/^minimax/.test(id)) return { letter: "M", bg: "#F2545B" };
  if (/^mistral/.test(id)) return { letter: "M", bg: "#FF7000" };
  if (/^doubao/.test(id)) return { letter: "D", bg: "#3B7BFF" };
  if (/^(ernie|wenxin)/.test(id)) return { letter: "E", bg: "#2932E1" };
  if (/^hunyuan/.test(id)) return { letter: "H", bg: "#0052D9" };
  return null;
}

function LetterBadge({
  letter,
  bg,
  size,
}: {
  letter: string;
  bg: string;
  size: number;
}) {
  return (
    <span
      aria-hidden
      className="flex-none select-none font-bold leading-none text-white"
      style={{
        width: size,
        height: size,
        background: bg,
        borderRadius: Math.max(3, size * 0.24),
        display: "grid",
        placeItems: "center",
        fontSize: Math.round(size * 0.6),
      }}
    >
      {letter}
    </span>
  );
}
