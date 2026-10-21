/** Image numbers always follow the actual reference submission order. */
export function insertImageMention(value: string, start: number, end: number, number: number, english = false) {
  const token = english ? `@Image${number}` : `@图片${number}`;
  const from = Math.max(0, Math.min(value.length, start));
  const to = Math.max(from, Math.min(value.length, end));
  const inserted = token + " ";
  return { value: value.slice(0, from) + inserted + value.slice(to), caret: from + inserted.length };
}

/** Keep explicit mentions attached to the same image after removal/reordering. */
export function remapImageMentions(value: string, previous: readonly string[], current: readonly string[]) {
  return value.replace(/@(图片|Image)([1-9]\d*)/g, (token, label: string, digits: string) => {
    const key = previous[Number(digits) - 1];
    if (key === undefined) return token;
    const index = current.indexOf(key);
    return index < 0 ? "" : `@${label}${index + 1}`;
  });
}
