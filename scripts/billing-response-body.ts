import type { Page, Response } from "@playwright/test";

/** Test-only observer: retain the original browser response across navigation.
 * No route, request, response or page behavior is replaced. Chromium otherwise
 * may discard the renderer-owned body before its CDP reader obtains it. */
export async function captureBillingResponseBody(page: Page, predicate: (response: Response) => boolean) {
    const session = await page.context().newCDPSession(page);
    try {
        await session.send("Network.enable", {
            maxTotalBufferSize: 10 * 1024 * 1024,
            maxResourceBufferSize: 10 * 1024 * 1024,
            enableDurableMessages: true,
        });
    } catch (error) {
        await session.detach();
        throw error;
    }
    const result = page.waitForResponse(predicate)
        .then(async accepted => ({ accepted, text: await accepted.text() }));
    return { result, dispose: () => session.detach() };
}
