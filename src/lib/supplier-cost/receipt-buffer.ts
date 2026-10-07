/** Streaming JSON capture: retain accounting metadata without retaining base64/media strings.
 * Limits apply to each string and to retained metadata, not to the caller's response. */
export class ReceiptBuffer {
  private output = "";
  private value = "";
  private inside = false;
  private escaped = false;
  private omitted = false;
  private overflow = false;
  constructor(private readonly stringLimit = 8192, private readonly metadataLimit = 2 * 1024 * 1024) {}
  push(chunk: string) {
    if (this.overflow) return;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (!this.inside) {
        if (c === '"') { this.inside = true; this.value = '"'; this.escaped = false; this.omitted = false; }
        else this.output += c;
      } else {
        if (!this.omitted) {
          this.value += c;
          if (this.value.length > this.stringLimit) { this.value = ""; this.omitted = true; }
        }
        if (c === '"' && !this.escaped) {
          this.output += this.omitted ? '"[large-string-omitted]"' : this.value;
          this.inside = false; this.value = "";
        } else if (this.escaped) this.escaped = false;
        else if (c === "\\") this.escaped = true;
      }
      if (this.output.length > this.metadataLimit) { this.overflow = true; this.output = ""; this.value = ""; return; }
    }
  }
  result(): string | null { return this.overflow || this.inside ? null : this.output; }
}
