import { convert, explain } from "./audio.js";
import { saveAudio } from "./files.js";
import { fetchAudio, filename, identify, lookup } from "./song.js";

const el = id => document.getElementById(id);
const form = el("lookup");
const input = el("link");
const result = el("result");
const formats = result.querySelector("fieldset");
const save = el("save");
let song = null;
let source = null;
let prepared = null;

function status(message = "", error = false) {
  el("status").textContent = message;
  el("status").classList.toggle("error", error);
}

function busy(working) {
  input.readOnly = working;
  el("resolve").disabled = working;
  save.disabled = working;
  formats.disabled = working;
  form.setAttribute("aria-busy", String(working));
}

function reset() {
  song = null;
  source = null;
  prepared = null;
  save.textContent = "保存 " + format().toUpperCase();
  result.hidden = true;
  status();
}

function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

const initial = location.hash.slice(1);
if (identify(initial)) input.value = initial;
input.addEventListener("input", reset);
input.focus();

form.addEventListener("submit", async event => {
  event.preventDefault();
  reset();
  busy(true);
  status("正在解析歌曲…");
  try {
    song = await lookup(input.value);
    el("title").textContent = song.title;
    el("detail").textContent = [song.artist, duration(song.duration)].filter(Boolean).join(" · ");
    result.hidden = false;
    status();
  } catch (error) {
    status(explain(error), true);
  } finally {
    busy(false);
  }
});

const formatNotes = {
  m4a: "直接保存解析服务提供的 M4A。",
  mp3: "在本机将 M4A 转为 44.1 kHz MP3。",
  wav: "在本机将 M4A 转为 44.1 kHz WAV，适合导入剪辑软件。音质取决于源 M4A。"
};
function format() { return formats.querySelector(":checked").value; }
formats.addEventListener("change", () => {
  prepared = null;
  save.textContent = "保存 " + format().toUpperCase();
  el("format-note").textContent = formatNotes[format()];
  status();
});

save.addEventListener("click", async () => {
  if (!song) return;
  busy(true);
  const target = format();
  try {
    if (!prepared) {
      status("正在准备音频，请保持此页打开…");
      source ??= await fetchAudio(song);
      prepared = target === "m4a" ? source : await convert(source, target, status);
      if (!navigator.userActivation.isActive) {
        save.textContent = "选择位置并保存";
        status("音频已就绪，请点击按钮选择保存位置。");
        return;
      }
    }
    status("请选择保存位置…");
    const name = await saveAudio(prepared, filename(song, target), target);
    status("已保存 " + name);
  } catch (error) {
    status(explain(error), true);
  } finally {
    busy(false);
  }
});
