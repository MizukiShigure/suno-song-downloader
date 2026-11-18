export function explain(error) {
  if (error.name === "AbortError") return "已取消。";
  if (error.name === "NotAllowedError") return "没有写入权限，请重新选择可保存的文件夹。";
  if (error.name === "TimeoutError") return "请求超时，请稍后重试。";
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "无法连接服务。请检查网络及扩展的网站访问权限，然后重试。";
  }
  if (/cancel|USER_CANCELED/i.test(error.message)) return "已取消保存。";
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
