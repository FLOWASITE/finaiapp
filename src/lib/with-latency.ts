/**
 * Bọc handler của server function để log latency dạng JSON 1 dòng.
 * Đọc qua worker logs với search `serverfn.latency`.
 *
 * Note: `TArg` mặc định là `any` để TanStack Start tự suy ra shape của
 * `{ data, context }` mà không cần annotate.
 */
function nowMs(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

export function withLatency<TArg = any, TResult = any>(
  name: string,
  fn: (arg: TArg) => Promise<TResult>,
): (arg: TArg) => Promise<TResult> {
  return async (arg: TArg): Promise<TResult> => {
    const t0 = nowMs();
    try {
      const result = await fn(arg);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          kind: "serverfn.latency",
          name,
          ms: Math.round(nowMs() - t0),
          ok: true,
        }),
      );
      return result;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          kind: "serverfn.latency",
          name,
          ms: Math.round(nowMs() - t0),
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      throw e;
    }
  };
}
