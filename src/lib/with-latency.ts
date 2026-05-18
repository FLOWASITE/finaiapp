/**
 * Bọc handler của server function để log latency dạng JSON 1 dòng.
 * Đọc qua worker logs với search `serverfn.latency`.
 */
export function withLatency<TArgs extends any[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const t0 =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    try {
      const result = await fn(...args);
      const ms = Math.round(
        (typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now()) - t0,
      );
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ kind: "serverfn.latency", name, ms, ok: true }),
      );
      return result;
    } catch (e) {
      const ms = Math.round(
        (typeof performance !== "undefined" && performance.now
          ? performance.now()
          : Date.now()) - t0,
      );
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          kind: "serverfn.latency",
          name,
          ms,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      throw e;
    }
  };
}
