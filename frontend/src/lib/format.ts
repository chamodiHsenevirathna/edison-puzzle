/** 83_000 -> "1:23", 3_723_000 -> "1:02:03", 4_200 -> "0:04.2" (tenths under one minute). */
export function formatDuration(ms: number): string {
  let total = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  const tenths = (total / 1000).toFixed(1);
  if (total < 60_000) {
    if (Number(tenths) < 60) return `0:${tenths.padStart(4, "0")}`;
    total = 60_000; // 59.96 s would print as 0:60.0
  }
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatInt(n)} ${n === 1 ? one : many}`;
}
