/** Read a mutation receipt, never retry a mutation or infer non-acceptance. */
export async function readBillingSubmissionResponse(response: Response, operationId: string, timeoutMs = 30_000, requestUrl?: string): Promise<{response: Response; data: Record<string, unknown>}> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reader = response.body?.getReader();
    const unknown = () => {
        const data = {
            code: "OPERATION_PENDING",
            recoveryCode: "RECEIPT_UNREADABLE",
            operationId,
            error: "结果响应中断，任务状态尚未确认；请保留原操作稍后查询，不会自动重复生成",
        };
        return { response: Response.json(data, { status: 409, headers: { "cache-control": "private, no-store" } }), data };
    };
    if (!reader) return unknown();
    try {
        const read = async () => {
            const decoder = new TextDecoder();
            let text = "";
            for (;;) {
                const part = await reader.read();
                if (part.done) break;
                text += decoder.decode(part.value, { stream: true });
            }
            return text + decoder.decode();
        };
        const text = await Promise.race([
            read(),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("receipt body deadline")), timeoutMs); }),
        ]);
        const data: unknown = JSON.parse(text);
        if (!data || typeof data !== "object" || Array.isArray(data)) return unknown();
        const receipt = data as Record<string, unknown>;
        const path = requestUrl?.split(/[?#]/, 1)[0];
        if (response.ok && path === "/api/generate-image" &&
            (typeof receipt.jobId !== "string" || !/^(?:job|imagegen)-[a-zA-Z0-9-]{1,160}$/.test(receipt.jobId))) return unknown();
        if (response.ok && path && /^\/api\/(?:cutout|dewatermark|avatar|extract|style|upscale|recolor|replicate)$/.test(path) &&
            (receipt.ok !== true || typeof receipt.url !== "string" || !receipt.url)) return unknown();
        const headers = new Headers(response.headers);
        // fetch has already decoded the transfer body. Do not carry stale wire lengths.
        headers.delete("content-length");
        headers.delete("content-encoding");
        return { response: new Response(text, { status: response.status, statusText: response.statusText, headers }), data: data as Record<string, unknown> };
    } catch {
        // Cancels only this response-body reader, not accepted server work.
        void reader.cancel().catch(() => {});
        return unknown();
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        reader.releaseLock();
    }
}
