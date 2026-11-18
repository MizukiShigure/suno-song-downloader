import { convert, explain } from "./audio.js";
import { chooseAudioDirectory, saveAudio, saveInDirectory } from "./files.js";
import { fetchAudio, filename, lookup } from "./song.js";

const title = document.querySelector("#title");
const summary = document.querySelector("#summary");
const save = document.querySelector("#save");
const stop = document.querySelector("#stop");
const list = document.querySelector("#tracks");
const rows = new Map();
const win = await chrome.windows.getCurrent();
const key = "save-window-" + win.id;
const job = (await chrome.storage.session.get(key))[key];
let prepared;
let name;
let stopping = false;
let busy = false;

function setStatus(text) { summary.textContent = text; }
function updateRow(track, status) {
  const row = rows.get(track.id);
  row.firstChild.textContent = track.name || track.id;
  row.lastChild.textContent = status;
}
async function prepare(track, progress) {
  const song = await lookup(track.id);
  track.name = song.title;
  const source = await fetchAudio(song);
  const blob = job.format === "m4a" ? source : await convert(source, job.format, progress);
  return { blob, name: filename(song, job.format) };
}

async function prepareSingle() {
  const [track] = job.tracks;
  title.textContent = track.name || "保存歌曲";
  setStatus("正在准备 " + job.format.toUpperCase() + "…");
  save.disabled = true;
  try {
    const file = await prepare(track, setStatus);
    prepared = file.blob;
    name = file.name;
    title.textContent = track.name;
    setStatus(name);
    save.textContent = "选择位置并保存";
  } catch (error) {
    setStatus(explain(error));
    save.textContent = "重新准备";
  } finally { save.disabled = false; }
}

function batchButton() {
  const remaining = job.tracks.filter(track => !track.saved).length;
  save.disabled = remaining === 0;
  save.textContent = remaining ? "选择文件夹，保存 " + remaining + " 首" : "已全部保存";
}

async function runBatch() {
  const dir = await chooseAudioDirectory();
  stopping = false;
  stop.hidden = false;
  stop.disabled = false;
  let failed = 0;
  let done = job.tracks.filter(track => track.saved).length;
  for (const track of job.tracks) {
    if (stopping) break;
    if (track.saved) continue;
    setStatus("已保存 " + done + " / " + job.tracks.length + " · 正在处理 " + (track.name || track.id));
    updateRow(track, "正在获取音频…");
    try {
      const file = await prepare(track, text => updateRow(track, text));
      track.saved = await saveInDirectory(dir, file.blob, file.name);
      done++;
      updateRow(track, "已保存 · " + track.saved);
    } catch (error) {
      failed++;
      updateRow(track, "失败 · " + explain(error));
      continue;
    }
    await chrome.storage.session.set({ [key]: job });
  }
  const remaining = job.tracks.length - done;
  setStatus("已保存 " + done + " / " + job.tracks.length + " 首" +
    (failed ? "，本次失败 " + failed + " 首" : "") + (remaining ? "。可继续保存剩余歌曲。" : "。"));
}

stop.addEventListener("click", () => { stopping = true; stop.disabled = true; });
save.addEventListener("click", async () => {
  if (busy || !job) return;
  if (!job.batch && !prepared) { await prepareSingle(); return; }
  busy = true;
  save.disabled = true;
  try {
    if (job.batch) await runBatch();
    else {
      const saved = await saveAudio(prepared, name, job.format);
      setStatus("已保存 " + saved);
      save.textContent = "再存一份";
    }
  } catch (error) {
    setStatus(explain(error));
  } finally {
    busy = false;
    stop.hidden = true;
    if (job.batch) batchButton(); else save.disabled = false;
  }
});
window.addEventListener("beforeunload", event => {
  if (busy) { event.preventDefault(); event.returnValue = true; }
});

if (!job) {
  setStatus("本次任务已结束，请从 Suno 页面重新选择歌曲。");
  save.hidden = true;
} else if (!job.batch) {
  await prepareSingle();
} else {
  title.textContent = "批量保存 " + job.tracks.length + " 首 · " + job.format.toUpperCase();
  for (const track of job.tracks) {
    const row = document.createElement("li");
    row.append(document.createElement("span"), document.createElement("small"));
    list.append(row);
    rows.set(track.id, row);
    updateRow(track, track.saved ? "已保存 · " + track.saved : "等待保存");
  }
  list.hidden = false;
  setStatus("为本批歌曲选一次文件夹。同名文件会自动编号。");
  batchButton();
}
