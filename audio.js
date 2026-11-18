export function explain(error) {
  if (error.name === "TimeoutError") return "请求超时，请稍后重试。";
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "无法连接服务。请检查网络及扩展的网站访问权限，然后重试。";
  }
  if (/^(?:User cancel(?:ed|led)(?: the download)?\.?|USER_CANCELED)$/i.test(error.message)) return "浏览器已取消这次下载。";
  return error.message;
}

export async function convert(blob, target, status = () => {}) {
  status("正在解码 M4A，请保持此页打开…");
  const decoder = new OfflineAudioContext(2, 1, 44100);
  let decoded;
  try { decoded = await decoder.decodeAudioData(await blob.arrayBuffer()); }
  catch { throw new Error("浏览器无法解码这份音频。可以选择 M4A 保存原始文件。"); }
  if (decoded.numberOfChannels > 2) throw new Error("此音频包含两个以上声道，请选择 M4A 保存。");
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i).slice());
  const worker = new Worker("encode.js");
  status("正在生成 " + target.toUpperCase() + "…");
  try {
    return await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.error) reject(new Error(data.error));
        else if (data.file) resolve(data.file);
        else status("正在生成 MP3 · " + data.percent + "%");
      };
      worker.onerror = () => reject(new Error("音频编码失败，请重试或保存 M4A。"));
      worker.postMessage({ format: target, channels, rate: decoded.sampleRate }, channels.map(channel => channel.buffer));
    });
  } finally {
    worker.terminate();
  }
}

export function waitForDownload(id) {
  return new Promise((resolve, reject) => {
    function check(state, reason) {
      if (state !== "complete" && state !== "interrupted") return;
      chrome.downloads.onChanged.removeListener(changed);
      if (state === "complete") resolve();
      else reject(new Error("下载中断（" + (reason || "未知原因") + "）。"));
    }
    function changed(delta) {
      if (delta.id === id) check(delta.state?.current, delta.error?.current);
    }
    chrome.downloads.onChanged.addListener(changed);
    // Small files may already be complete before the listener is attached.
    chrome.downloads.search({ id }).then(([item]) => {
      if (item) check(item.state, item.error);
      else check("interrupted", "下载记录已移除");
    }).catch(error => {
      chrome.downloads.onChanged.removeListener(changed);
      reject(error);
    });
  });
}
