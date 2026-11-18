const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sunoHosts = new Set(["suno.com", "www.suno.com"]);
const provider = "https://ai-suno.com";
const mediaOrigins = new Set([provider, "https://sunoaicdn.001235.xyz"]);

export function identify(text) {
  const value = String(text || "").trim();
  if (idPattern.test(value)) return { id: value.toLowerCase() };
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !sunoHosts.has(url.hostname) ||
      url.port || url.username || url.password) return null;
  const match = /^\/(song|s)\/([^/]+)\/?$/.exec(url.pathname);
  if (!match) return null;
  const [, kind, token] = match;
  if (kind === "song" && idPattern.test(token)) return { id: token.toLowerCase() };
  if (kind === "s" && /^[a-z\d_-]{1,128}$/i.test(token)) {
    return { share: "https://suno.com/s/" + token };
  }
  return null;
}

async function resolveShare(share) {
  const response = await fetch(share, {
    credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(25000)
  });
  if (response.ok) {
    const id = identify(response.url)?.id;
    if (id) return id;
  }
  throw new Error("分享短链未能展开。请在 Suno 打开歌曲，复制地址栏里的完整单曲链接。");
}

export async function lookup(input) {
  const link = identify(input);
  if (!link) throw new Error("请输入 Suno 单曲链接、分享短链或完整歌曲 ID。");
  const id = link.id || await resolveShare(link.share);
  const response = await fetch(provider + "/api/song?id=" + id, {
    credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    redirect: "error", signal: AbortSignal.timeout(45000)
  });
  if (response.status === 429) throw new Error("解析服务请求较多，请稍后重试。");
  if (!response.ok) throw new Error("解析服务返回 HTTP " + response.status + "。请检查链接或稍后重试。");
  const { song } = await response.json();
  if (song?.id?.toLowerCase() !== id) throw new Error("解析服务返回的歌曲信息不匹配。");
  if (!song.media?.url) throw new Error("已找到歌曲，但服务暂未提供可下载的音频。");
  const media = new URL(song.media.url, provider);
  if (!mediaOrigins.has(media.origin) || media.username || media.password) {
    throw new Error("服务返回了新的音频域名，当前版本暂不支持。");
  }
  return {
    id, title: String(song.title || id), artist: String(song.artist || ""),
    duration: Number(song.duration), url: media.href
  };
}

export async function fetchAudio(song) {
  const response = await fetch(song.url, {
    credentials: "omit", referrerPolicy: "no-referrer",
    redirect: "error", signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error("音频服务器返回 HTTP " + response.status + "。请重新解析后再试。");
  const audio = await response.blob();
  // ISO Base Media files identify their container with an ftyp box.
  if (audio.size < 12 || await audio.slice(4, 8).text() !== "ftyp") {
    throw new Error("服务器返回的文件不是可识别的 M4A 音频。");
  }
  return audio.slice(0, audio.size, "audio/mp4");
}

export function filename(song, format) {
  let stem = Array.from(song.title.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/gu, "-").trim())
    .slice(0, 90).join("").replace(/^[. ]+|[. ]+$/g, "");
  if (!stem) stem = song.id;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = "_" + stem;
  return stem + "." + format;
}
