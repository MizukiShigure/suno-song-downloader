import { identify } from "./song.js";
import { explain, waitForDownload } from "./audio.js";

chrome.action.onClicked.addListener(tab => {
  const link = identify(tab.url);
  const page = new URL(chrome.runtime.getURL("index.html"));
  if (link) page.hash = link.share || "https://suno.com/song/" + link.id;
  chrome.tabs.create({ url: page.href });
});

const offscreenUrl = chrome.runtime.getURL("offscreen.html");
let creating;

async function ensureEncoder() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [offscreenUrl] });
  if (creating) return creating;
  if (contexts.length) return;
  creating = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS", "WORKERS"],
    justification: "在 Suno 页面下载选中的歌曲，按所选格式生成本地音频文件。"
  }).finally(() => { creating = null; });
  await creating;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  let work;
  if (["inline-download", "batch-ready"].includes(message?.type) && sender.tab && sender.frameId === 0 &&
      ["https://suno.com", "https://www.suno.com"].includes(sender.origin)) {
    if (message.type === "batch-ready") {
      ensureEncoder().then(() => respond({ ok: true }), error => respond({ ok: false, error: explain(error) }));
      return true;
    }
    const { id, format } = message;
    if (typeof id !== "string" || identify(id)?.id !== id || !["m4a", "mp3", "wav"].includes(format)) return;
    work = async () => {
      await ensureEncoder();
      const result = await chrome.runtime.sendMessage({ type: "encode-song", id, format });
      if (!result?.ok) throw new Error(result?.error || "下载任务未完成，请重试。");
    };
  } else if (message?.type === "save-audio" && sender.url === offscreenUrl &&
             typeof message.url === "string" && message.url.startsWith("blob:" + chrome.runtime.getURL(""))) {
    work = async () => {
      const id = await chrome.downloads.download({
        url: message.url, filename: message.name, saveAs: true, conflictAction: "uniquify"
      });
      await waitForDownload(id);
    };
  } else {
    return;
  }
  work().then(() => respond({ ok: true }), error => respond({ ok: false, error: explain(error) }));
  return true;
});
