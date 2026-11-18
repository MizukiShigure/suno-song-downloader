// Loaded only in the extension's isolated Suno content-script world.
async function saveBatchFile(directory, blob, name) {
  // Serialize filename allocation across Suno tabs on this origin.
  return navigator.locks.request("suno-batch-write", async () => {
    const dot = name.lastIndexOf(".");
    for (let number = 1; ; number++) {
      const candidate = number === 1 ? name : name.slice(0, dot) + " (" + number + ")" + name.slice(dot);
      try {
        await directory.getFileHandle(candidate);
        continue;
      } catch (error) {
        if (error.name === "TypeMismatchError") continue; // A directory also occupies the name.
        if (error.name !== "NotFoundError") throw error;
      }
      const handle = await directory.getFileHandle(candidate, { create: true });
      try {
        await blob.stream().pipeTo(await handle.createWritable());
      } catch (error) {
        // Our new placeholder can survive a full disk or a failed write.
        try {
          const current = await directory.getFileHandle(candidate);
          if (await handle.isSameEntry(current) && (await current.getFile()).size === 0) {
            await directory.removeEntry(candidate);
          }
        } catch { /* The volume may already be disconnected. */ }
        throw error;
      }
      return candidate;
    }
  });
}

function receiveBatchFile(id, format) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: "suno-batch-file" });
    const chunks = [];
    let name, size, received = 0, settled = false;
    function fail(error) {
      if (settled) return;
      settled = true;
      port.disconnect();
      reject(error);
    }
    port.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError?.message || "音频传输中断，请重试。";
      if (!settled) reject(new Error(reason));
      settled = true;
    });
    port.onMessage.addListener(message => {
      try {
        if (message.type === "error") throw new Error(message.error);
        if (message.type === "info" && typeof message.name === "string" && Number.isSafeInteger(message.size) && message.size > 0) {
          name = message.name;
          size = message.size;
        } else if (message.type === "chunk" && name && message.offset === received) {
          const bytes = Uint8Array.from(atob(message.data), c => c.charCodeAt(0));
          received += bytes.length;
          if (!bytes.length || received > size) throw new Error("音频分块长度异常。");
          chunks.push(bytes);
        } else if (message.type === "end" && name && received === size) {
          settled = true;
          port.disconnect();
          resolve({ name, blob: new Blob(chunks) });
          return;
        } else throw new Error("音频传输不完整，请重试。");
        port.postMessage({ type: "next" });
      } catch (error) { fail(error); }
    });
    port.postMessage({ type: "start", id, format });
  });
}
