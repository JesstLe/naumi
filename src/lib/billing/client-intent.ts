import { browserSha256Hex } from "../browser-crypto";

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
    else if(typeof init.body === "string") {
        let value:unknown=init.body;
        try {const parsed=JSON.parse(init.body);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed)){delete parsed.operationId;delete parsed.idempotencyKey;value=Object.fromEntries(Object.entries(parsed).sort(([a],[b])=>a.localeCompare(b)));}}catch{}
        body.push(value);
    }else body.push("");
    const headers = new Headers(init.headers);
    return `naumi:billing-intent:${await digest(new TextEncoder().encode(JSON.stringify([email, url, headers.get("x-naumi-image-quality"), headers.get("x-naumi-text-model"), headers.get("x-naumi-feature-model"), headers.get("x-naumi-billing-intent-slot"), body])))}`;
}
async function digest(value: ArrayBuffer | Uint8Array) {
    return browserSha256Hex(value instanceof Uint8Array ? value : new Uint8Array(value));
}

export function frozenIntentBody(init:RequestInit,id:string):RequestInit {
    if(typeof init.body!=="string")return init;
    try {const body=JSON.parse(init.body);if(body&&typeof body==="object"&&!Array.isArray(body)){if("idempotencyKey" in body)body.idempotencyKey=id;if("operationId" in body)body.operationId=id;return {...init,body:JSON.stringify(body)};}}catch{}
    return init;
}
