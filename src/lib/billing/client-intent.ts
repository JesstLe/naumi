/** Hashes request content locally; stores only an opaque operation identifier. */
export async function clientIntentKey(email: string, url: string, init: RequestInit) {
    const body: unknown[] = [];
    if (init.body instanceof FormData) {
        for (const [key, value] of Array.from(init.body.entries()).sort(([a], [b]) => a.localeCompare(b))) {
            if (key === "billingVersion" || key === "billingCredits")
                continue;
            body.push([key, typeof value === "string" ? value : { name: value.name, type: value.type, hash: await digest(await value.arrayBuffer()) }]);
        }
    }
    else
        body.push(typeof init.body === "string" ? init.body : "");
    const headers = new Headers(init.headers);
    return `naumi:billing-intent:${await digest(new TextEncoder().encode(JSON.stringify([email, url, headers.get("x-naumi-image-quality"), headers.get("x-naumi-text-model"), body])))}`;
}
async function digest(value: BufferSource) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", value))).map(n => n.toString(16).padStart(2, "0")).join(""); }
