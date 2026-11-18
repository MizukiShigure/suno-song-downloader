import { fetchAudio, filename, lookup } from "./song.js";
import { convert, explain } from "./audio.js";

async function downloadSong(id, format) {
  const song = await lookup(id);
  const source = await fetchAudio(song);
  const file = format === "m4a" ? source : await convert(source, format);
  const url = URL.createObjectURL(file);
  try {
    const result = await chrome.runtime.sendMessage({ type: "save-audio", url, name: filename(song, format) });
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
