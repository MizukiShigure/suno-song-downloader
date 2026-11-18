import { identify } from "./song.js";

chrome.action.onClicked.addListener(tab => {
  const link = identify(tab.url);
  const page = new URL(chrome.runtime.getURL("index.html"));
  if (link) page.hash = link.share || "https://suno.com/song/" + link.id;
  chrome.tabs.create({ url: page.href });
});

async function openSaveWindow(tracks, format, batch) {
  const win = await chrome.windows.create({ url: "about:blank", type: "popup", width: 480, height: batch ? 540 : 330, focused: true });
  const key = "save-window-" + win.id;
  try {
    const [tab] = await chrome.tabs.query({ windowId: win.id });
    await chrome.storage.session.set({ [key]: { tracks, format, batch } });
    await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL("save.html") });
  } catch (error) {
    await chrome.storage.session.remove(key);
    await chrome.windows.remove(win.id).catch(() => {});
    throw error;
  }
}

chrome.windows.onRemoved.addListener(id => chrome.storage.session.remove("save-window-" + id));

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "open-save" || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 ||
      !["https://suno.com", "https://www.suno.com"].includes(sender.origin)) return;
  const { tracks, format, batch } = message;
  if (!["m4a", "mp3", "wav"].includes(format) || !Array.isArray(tracks) || !tracks.length ||
      typeof batch !== "boolean" || (!batch && tracks.length !== 1)) return;
  const songs = new Map();
  for (const track of tracks) {
    if (typeof track?.id !== "string" || identify(track.id)?.id !== track.id) return;
    songs.set(track.id, { id: track.id, name: String(track.name || "").slice(0, 200) });
  }
  openSaveWindow([...songs.values()], format, batch)
    .then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});
