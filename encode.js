// Executed in its own worker so encoding a full song keeps the page responsive.
function pcm(sample) {
  const clipped = Math.max(-1, Math.min(1, sample));
  return Math.round(clipped * (clipped < 0 ? 32768 : 32767));
}

function wav(channels, rate) {
  const frames = channels[0].length;
  const block = channels.length * 2;
  const data = new DataView(new ArrayBuffer(44 + frames * block));
  function label(offset, text) {
    for (let i = 0; i < text.length; i++) data.setUint8(offset + i, text.charCodeAt(i));
  }
  label(0, "RIFF");
  data.setUint32(4, data.byteLength - 8, true);
  label(8, "WAVE");
  label(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, channels.length, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * block, true);
  data.setUint16(32, block, true);
  data.setUint16(34, 16, true);
  label(36, "data");
  data.setUint32(40, data.byteLength - 44, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (const channel of channels) {
      data.setInt16(offset, pcm(channel[frame]), true);
      offset += 2;
    }
  }
  return new Blob([data], { type: "audio/wav" });
}

function mp3(channels, rate) {
  importScripts("vendor/lame.js");
  const encoder = new lamejs.Mp3Encoder(channels.length, rate, 192);
  const blocks = [];
  const length = channels[0].length;
  const blockSize = 1152 * 16;
  let percent = -1;
  for (let i = 0; i < length; i += blockSize) {
    const pcmBlocks = channels.map(channel => Int16Array.from(channel.subarray(i, i + blockSize), pcm));
    const bytes = encoder.encodeBuffer(...pcmBlocks);
    if (bytes.length) blocks.push(bytes);
    const next = Math.floor((i + pcmBlocks[0].length) * 100 / length);
    if (percent !== next) self.postMessage({ percent: next });
    percent = next;
  }
  blocks.push(encoder.flush());
  return new Blob(blocks, { type: "audio/mpeg" });
}

self.onmessage = ({ data }) => {
  try {
    const file = data.format === "wav" ? wav(data.channels, data.rate) : mp3(data.channels, data.rate);
    self.postMessage({ file });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
