import { fetchAudio, filename, identify, lookup } from "./song.js";
import { convert, explain } from "./audio.js";

async function prepare(id, format) {
  const song = await lookup(id);
  const source = await fetchAudio(song);
  const file = format === "m4a" ? source : await convert(source, format);
  return { file, name: filename(song, format) };
}

async function downloadSong(id, format) {
  const { file, name } = await prepare(id, format);
  const url = URL.createObjectURL(file);
  try {
    const result = await chrome.runtime.sendMessage({ type: "save-audio", url, name });
    if (!result?.ok) throw new Error(result?.error || "保存失败，请重试。");
  } finally {
    URL.revokeObjectURL(url);
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "encode-song" || sender.id !== chrome.runtime.id || sender.tab) return;
  downloadSong(message.id, message.format).then(
    () => respond({ ok: true }),
    error => respond({ ok: false, error: explain(error) })
  );
  return true;
});

// The chosen directory belongs to the Suno tab. Send one bounded chunk per
// acknowledgement so long WAVs also work with Chrome's JSON messaging limit.
chrome.runtime.onConnect.addListener(port => {
  const sender = port.sender;
  if (port.name !== "suno-batch-file" || sender?.id !== chrome.runtime.id || !sender.tab ||
      sender.frameId !== 0 || !["https://suno.com", "https://www.suno.com"].includes(sender.origin)) return;
  let file, offset = 0, started = false, closed = false, sending = false;
  port.onDisconnect.addListener(() => { closed = true; file = null; });
  port.onMessage.addListener(async message => {
    if (closed || sending) return;
    sending = true;
    try {
      if (!started) {
        if (message.type !== "start" || typeof message.id !== "string" || identify(message.id)?.id !== message.id ||
            !["m4a", "mp3", "wav"].includes(message.format)) throw new Error("无效的歌曲或格式。");
        started = true;
        const output = await prepare(message.id, message.format);
        if (closed) return;
        file = output.file;
        port.postMessage({ type: "info", name: output.name, size: file.size });
      } else if (message.type === "next" && file) {
        if (offset >= file.size) { port.postMessage({ type: "end" }); return; }
        const slice = file.slice(offset, offset + 384 * 1024);
        const reader = new FileReader();
        const data = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(slice);
        });
        if (closed) return;
        port.postMessage({ type: "chunk", offset, data });
        offset += slice.size;
      }
    } catch (error) {
      if (!closed) port.postMessage({ type: "error", error: explain(error) });
    } finally { sending = false; }
  });
});
