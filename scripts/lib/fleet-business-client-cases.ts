type Reader = (url: string, signal: AbortSignal) => Promise<unknown>;
type ReadError = new (...args: any[]) => Error & { status?: number };

/** Actual transport execution against finite HTTP responses; no API or database. */
export async function fleetBusinessClientCases(read: Reader, ErrorClass: ReadError) {
  const cases = [
    { name: "502_html", status: 502, body: "<html>Bad Gateway</html>", message: "站点数据读取失败" },
    { name: "504_empty", status: 504, body: "", message: "站点数据读取失败" },
    { name: "500_null", status: 500, body: "null", message: "站点数据读取失败" },
    { name: "503_scalar", status: 503, body: '"unavailable"', message: "站点数据读取失败" },
    { name: "500_message", status: 500, body: '{"error":"查询暂未完成"}', message: "查询暂未完成" },
    { name: "500_nonstring_message", status: 500, body: '{"error":42}', message: "站点数据读取失败" },
    { name: "200_malformed", status: 200, body: "<html>not JSON</html>", message: "站点数据格式异常，请重试" },
    { name: "200_null", status: 200, body: "null", message: "站点数据格式异常" },
    { name: "401_unparsed", status: 401, body: "<html>login</html>", message: "登录已失效，请重新登录" },
    { name: "403_unparsed", status: 403, body: "null", message: "当前账号没有跨站数据访问权限" },
    { name: "404_unparsed", status: 404, body: "<html>not found</html>", message: "当前账号没有跨站数据访问权限" },
    { name: "504_missing_body", status: 504, body: null, message: "站点数据读取失败" },
  ];
  const previous = globalThis.fetch, results = [];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => new Response(item.body, { status: item.status });
      let caught: unknown;
      try { await read("/api/admin/business", new AbortController().signal); } catch (error) { caught = error; }
      const observed = caught instanceof Error ? { name: caught.name, message: caught.message, status: (caught as Error & { status?: number }).status } : { name: "NO_ERROR" };
      results.push({ name: item.name, passed: caught instanceof ErrorClass && caught.message === item.message && caught.status === (item.status === 200 ? undefined : item.status), expected: { message: item.message, status: item.status === 200 ? undefined : item.status }, observed });
    }
  } finally { globalThis.fetch = previous; }
  return results;
}
