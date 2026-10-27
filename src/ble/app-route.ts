export type AppRoute = { mode: string; data?: string };

const MODES = new Set(["playground", "director", "player", "helper", "algs", "f2l", "crossf2l", "blecross", "cfop", "bleconnect", "pll6", "seamlessop"]);

export function parseAppRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const requested = params.get("mode") || "playground";
  const mode = MODES.has(requested) ? requested : "playground";
  // 旧版分享链接的 base64 未编码 '+'，URLSearchParams 会当作空格；保留兼容。
  const rawData = /(?:\?|&)data=([^&]*)/.exec(search)?.[1] || "";
  let data = "";
  try { data = decodeURIComponent(rawData); } catch { data = rawData; }
  return mode === "player" ? { mode, data } : { mode };
}

export function routeUrl(route: AppRoute, pathname: string): string {
  const normalized = parseAppRoute(`?mode=${encodeURIComponent(route.mode)}`);
  if (normalized.mode === "playground") return pathname;
  const params = new URLSearchParams({ mode: normalized.mode });
  if (normalized.mode === "player" && route.data) params.set("data", route.data);
  return `${pathname}?${params.toString()}`;
}

export function routeKey(route: AppRoute): string {
  return route.mode === "player" ? `${route.mode}:${route.data || ""}` : route.mode;
}
