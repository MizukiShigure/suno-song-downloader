// All three save entry points run on the same extension origin and use this picker ID.
const picker = { id: "suno-song-audio", startIn: "downloads" };
const mime = { m4a: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav" };

async function write(handle, blob) {
  const stream = await handle.createWritable();
  await blob.stream().pipeTo(stream);
}

export async function saveAudio(blob, name, format) {
  const handle = await window.showSaveFilePicker({
    ...picker, suggestedName: name,
    types: [{ description: format.toUpperCase() + " 音频", accept: { [mime[format]]: ["." + format] } }]
  });
  await write(handle, blob);
  return handle.name;
}

export function chooseAudioDirectory() {
  return window.showDirectoryPicker({ ...picker, mode: "readwrite" });
}

export function saveInDirectory(directory, blob, name) {
  // Serialize filename allocation across concurrent batch windows in this extension.
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
        await write(handle, blob);
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
