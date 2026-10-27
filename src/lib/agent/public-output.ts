/** Boundaries that may still become a credential, protected line or image tag.
 * Release ordinary text immediately, retaining only ambiguous suffixes. */
export function publicOutputBoundary(text: string, literals: readonly string[]): number {
  let end = text.length;
  const ranges: [number, number][] = [];
  const suffix = (value: string, insensitive = false) => {
    const haystack = insensitive ? text.toLowerCase() : text;
    const needle = insensitive ? value.toLowerCase() : value;
    for (let n = Math.min(needle.length - 1, text.length); n > 0; n--) {
      if (haystack.endsWith(needle.slice(0, n))) { end = Math.min(end, text.length - n); break; }
    }
  };
  for (const literal of literals) {
    if (!literal) continue;
    suffix(literal);
    for (let at = text.indexOf(literal); at >= 0; at = text.indexOf(literal, at + 1)) ranges.push([at, at + literal.length]);
  }
  suffix("sk-", true); suffix("Bearer ", true); suffix("-----BEGIN "); suffix("!["); suffix("/media/");
  for(const match of text.matchAll(/\/media\/[\w./%-]+/g)) { const stop=match.index!+match[0].length; if(stop===text.length)end=Math.min(end,match.index!); else ranges.push([match.index!,stop]); }
  for (const match of text.matchAll(/\b(?:sk-[A-Za-z0-9_-]*|Bearer(?:\s+[A-Za-z0-9._~-]*)?)/gi)) {
    const start = match.index!, stop = start + match[0].length;
    if (stop === text.length) end = Math.min(end, start);
    else ranges.push([start, stop]);
  }
  for (const match of text.matchAll(/-----BEGIN /g)) {
    const start = match.index!, headerEnd = text.indexOf("-----", start + match[0].length);
    if (headerEnd < 0) { end = Math.min(end, start); continue; }
    if (!/PRIVATE KEY-----$/.test(text.slice(start, headerEnd + 5))) continue;
    const close = /-----END [^-]*PRIVATE KEY-----/.exec(text.slice(headerEnd + 5));
    if (!close) end = Math.min(end, start);
    else ranges.push([start, headerEnd + 5 + close.index + close[0].length]);
  }
  // Browser-renderable Markdown must be classified as a complete unit.
  for (const match of text.matchAll(/!\[[^\]]*(?:\](?:\([^)]*(?:\)|$)|\[[^\]]*(?:\]|$))?|$)/g)) {
    const start = match.index!, stop = start + match[0].length;
    if (!/\](?:\([^)]*\)|\[[^\]]*\])$/.test(match[0])) end = Math.min(end, start);
    else ranges.push([start, stop]);
  }
  // A candidate suffix may overlap a complete match; never split either.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [start, stop] of ranges) if (start < end && stop > end) { end = start; changed = true; }
  }
  if (end && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return end;
}
