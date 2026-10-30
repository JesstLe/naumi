import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Reuse ICU setup, never formatted user values. Local component checks retire
// a captured default timezone if the browser/Node timezone changes at runtime.
let dateFormatter: Intl.DateTimeFormat | undefined;
let timeFormatter: Intl.DateTimeFormat | undefined;
export function formatDate(input: string | number | Date, withTime = false) {
  const date = new Date(input);
  dateFormatter ||= new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // Date#toLocale* returns this literal rather than Intl#format's RangeError.
  if (!Number.isFinite(date.getTime())) return withTime ? "Invalid Date Invalid Date" : "Invalid Date";
  let d = dateFormatter.format(date);
  const localDay = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  if (d !== localDay) {
    dateFormatter = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
    d = dateFormatter.format(date);
  }
  if (!withTime) return d;
  timeFormatter ||= new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  let tm = timeFormatter.format(date);
  const localTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (tm !== localTime) {
    timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    tm = timeFormatter.format(date);
  }
  return `${d} ${tm}`;
}

/**
 * 锁定 body 滚动(弹窗打开时用)。
 * 关键:锁住时竖直滚动条消失会让页面宽度突然 +滚动条宽度,导致内容右移。
 * 这里测出滚动条宽度后补一个同宽的 padding-right,避免页面横向跳动。
 * 返回的函数用于解锁(还原原始样式)。
 */
export function lockBodyScroll(): () => void {
  if (typeof document === "undefined") return () => {};
  const body = document.body;
  const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
  const prevOverflow = body.style.overflow;
  const prevPaddingRight = body.style.paddingRight;
  body.style.overflow = "hidden";
  if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;
  return () => {
    body.style.overflow = prevOverflow;
    body.style.paddingRight = prevPaddingRight;
  };
}
