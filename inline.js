(() => {
  const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  const rowSelector = '.clip-row, [data-clip-id], [data-song-id], [data-testid="clip-row"], [data-testid="song-row"]';
  const linkSelector = 'a[href*="/song/"]';
  const watch = rowSelector + ", " + linkSelector + ", h1";
  const mounted = new Map();
  const checked = new Map();
  let opening = false;
  let batchActive = false;
  let stopAfterTrack = false;
  let feedback = "";
  let frame = 0;
  let selected;
  let trigger;

  function songId(href) {
    if (!href) return null;
    let url;
    try { url = new URL(href, location.href); } catch { return null; }
    if (!["https://suno.com", "https://www.suno.com"].includes(url.origin)) return null;
    const path = /^\/song\/([^/]+)\/?$/.exec(url.pathname);
    return path && uuid.test(path[1]) ? path[1].toLowerCase() : null;
  }

  function labelOf(el) {
    return (el?.getAttribute("aria-label") || el?.textContent || "").trim();
  }

  const menu = document.createElement("div");
  menu.id = "suno-single-download-menu";
  menu.setAttribute("popover", "auto");
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-labelledby", "suno-single-download-title");
  menu.innerHTML = '<strong id="suno-single-download-title"></strong>' +
    '<div class="suno-single-download-formats"></div><small role="status" aria-live="polite"></small>';
  const title = menu.querySelector("strong");
  const status = menu.querySelector("small");
  const options = [];
  for (const format of ["m4a", "mp3", "wav"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = format.toUpperCase();
    button.addEventListener("click", event => {
      event.stopPropagation();
      if (event.isTrusted) download(format);
    });
    menu.querySelector("div").append(button);
    options.push(button);
  }
  // Keep the site's playback shortcuts and row selection out of the format picker.
  for (const type of ["pointerdown", "pointerup", "keydown", "keyup"]) {
    menu.addEventListener(type, event => event.stopPropagation());
  }

  function showStatus(text, locked = false) {
    status.textContent = text;
    for (const button of options) button.disabled = locked;
  }

  const bar = document.createElement("aside");
  bar.id = "suno-batch-bar";
  bar.setAttribute("aria-label", "批量下载");
  bar.innerHTML = '<span aria-live="polite"></span><button type="button">批量下载</button><button type="button">清空</button><button type="button" hidden>完成当前歌曲后停止</button>';
  const [batchButton, clearButton, stopButton] = bar.querySelectorAll("button");
  batchButton.addEventListener("click", event => { if (event.isTrusted) open(batchButton, null); });
  clearButton.addEventListener("click", () => { checked.clear(); updateSelection(); });
  stopButton.addEventListener("click", () => { stopAfterTrack = true; stopButton.disabled = true; });

  function updateSelection() {
    for (const entry of mounted.values()) {
      entry.checkbox.checked = checked.has(entry.track.id);
      entry.checkbox.disabled = batchActive;
    }
    clearButton.hidden = batchActive;
    stopButton.hidden = !batchActive;
    batchButton.disabled = batchActive;
    if (!checked.size && !batchActive) {
      if (trigger === batchButton && menu.matches(":popover-open")) menu.hidePopover();
      bar.remove();
      return;
    }
    bar.querySelector("span").textContent = batchActive ? feedback : "已选 " + checked.size + " 首";
    if (!bar.isConnected) document.body.append(bar);
    if (trigger === batchButton) title.textContent = "批量下载 " + checked.size + " 首歌曲";
  }

  async function batchDownload(tracks, format) {
    // Open the OS chooser on the format click, before asynchronous messaging consumes the gesture.
    let directory;
    try {
      directory = await window.showDirectoryPicker({ id: "suno-song-audio", startIn: "downloads", mode: "readwrite" });
    } catch (error) {
      throw new Error(error.name === "AbortError" ? "浏览器未返回文件夹，已保留勾选。" : "无法选择文件夹：" + error.message);
    }
    const ready = await chrome.runtime.sendMessage({ type: "batch-ready" });
    if (!ready?.ok) throw new Error(ready?.error || "音频处理未启动，请重试。");
    const errors = [];
    let saved = 0;
    for (const track of tracks) {
      if (stopAfterTrack) break;
      feedback = "已保存 " + saved + "/" + tracks.length + " · " + (track.name || track.id);
      updateSelection();
      showStatus(feedback, true);
      try {
        const file = await receiveBatchFile(track.id, format);
        try { await saveBatchFile(directory, file.blob, file.name); }
        catch (error) { throw new Error("写入失败（" + error.name + "）：" + error.message); }
        checked.delete(track.id);
        saved++;
      } catch (error) { errors.push((track.name || track.id) + "：" + error.message); }
    }
    return "已保存 " + saved + "/" + tracks.length + " 首。" +
      (errors.length ? errors.join("；") : "") + (saved < tracks.length ? " 剩余歌曲已保留勾选。" : "");
  }

  async function download(format) {
    const single = selected;
    const tracks = single ? [single] : [...checked.values()];
    if (opening || !tracks.length) return;
    opening = true;
    batchActive = !single;
    stopAfterTrack = false;
    stopButton.disabled = false;
    feedback = single ? "正在准备音频，随后将打开浏览器「另存为」…" : "请选择本批歌曲的保存文件夹…";
    showStatus(feedback, true);
    updateSelection();
    try {
      if (single) {
        const result = await chrome.runtime.sendMessage({ type: "inline-download", id: single.id, format });
        if (!result?.ok) throw new Error(result?.error || "浏览器未能完成下载，请重试。");
        feedback = "已保存 " + format.toUpperCase() + " 文件。";
      } else feedback = await batchDownload(tracks, format);
    } catch (error) { feedback = error.message || "保存失败，请重试。"; }
    finally {
      opening = false;
      batchActive = false;
      showStatus(feedback);
      updateSelection();
    }
  }

  function position() {
    if (!menu.matches(":popover-open")) return;
    if (!trigger?.isConnected) {
      const replacement = [...mounted.values()].find(entry => entry.track.id === selected?.id && entry.button.isConnected);
      if (!replacement) { menu.hidePopover(); return; }
      trigger = replacement.button;
    }
    const rect = trigger.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8));
    const y = rect.bottom + 6 + menu.offsetHeight <= innerHeight
      ? rect.bottom + 6 : Math.max(8, rect.top - menu.offsetHeight - 6);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
  }

  function open(button, track) {
    if (trigger === button && menu.matches(":popover-open")) { menu.hidePopover(); return; }
    if (!menu.isConnected) document.body.append(menu);
    trigger = button;
    selected = track;
    title.textContent = track ? (track.name || "下载这首歌") : "批量下载 " + checked.size + " 首歌曲";
    showStatus(opening ? feedback : "所选歌曲将通过 ai-suno.com 解析。", opening);
    menu.showPopover();
    position();
    options.find(option => !option.disabled)?.focus({ preventScroll: true });
  }
  addEventListener("resize", position);
  document.addEventListener("scroll", position, { capture: true, passive: true });

  function mount(host, track, inside, seen) {
    if (!track.id || !host || seen.has(host)) return;
    seen.add(host);
    let entry = mounted.get(host);
    if (!entry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "suno-single-download-trigger";
      button.textContent = "↓ 下载";
      button.setAttribute("aria-haspopup", "dialog");
      const controls = document.createElement("span");
      controls.className = "suno-song-controls";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.title = "勾选以批量下载";
      controls.append(checkbox, button);
      entry = { button, checkbox, controls, track };
      mounted.set(host, entry);
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup", "dblclick", "click"]) {
        controls.addEventListener(type, event => event.stopPropagation());
      }
      checkbox.addEventListener("change", event => {
        if (!event.isTrusted) return;
        if (checkbox.checked) checked.set(entry.track.id, entry.track);
        else checked.delete(entry.track.id);
        updateSelection();
      });
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.isTrusted) open(button, entry.track);
      });
    }
    if (entry.track.id !== track.id && entry.button === trigger && menu.matches(":popover-open")) menu.hidePopover();
    entry.track = track;
    entry.checkbox.checked = checked.has(track.id);
    entry.checkbox.disabled = batchActive;
    entry.checkbox.setAttribute("aria-label", "选择 " + (track.name || "这首歌"));
    entry.button.setAttribute("aria-label", "下载 " + (track.name || "这首歌"));
    if (inside) {
      if (entry.controls.parentElement !== host) host.append(entry.controls);
    } else if (host.nextElementSibling !== entry.controls) {
      host.after(entry.controls);
    }
  }

  function sync() {
    frame = 0;
    const seen = new Set();
    for (const row of document.querySelectorAll(rowSelector)) {
      if (row.matches("a")) continue;
      const titleWrap = row.querySelector(".clip-title-wrapper");
      const anchor = titleWrap?.querySelector(linkSelector) || row.querySelector(linkSelector);
      const linked = songId(anchor?.href);
      const declared = row.getAttribute("data-clip-id") || row.getAttribute("data-song-id");
      const rowId = uuid.test(declared || "") ? declared.toLowerCase() : null;
      if (linked && rowId && linked !== rowId) continue;
      const host = titleWrap || anchor || row;
      mount(host, { id: rowId || linked, name: labelOf(anchor) || row.getAttribute("aria-label") || labelOf(titleWrap) }, host === row, seen);
    }
    for (const anchor of document.querySelectorAll(linkSelector)) {
      if (anchor.parentElement?.closest(rowSelector) || !labelOf(anchor)) continue;
      mount(anchor.closest(".clip-title-wrapper") || anchor, { id: songId(anchor.href), name: labelOf(anchor) }, false, seen);
    }
    const current = songId(location.href);
    if (current) {
      const heading = document.querySelector("#main-container h1, main h1") || document.querySelector("h1");
      if (heading) mount(heading, { id: current, name: labelOf(heading) }, false, seen);
    }
    for (const [host, { controls }] of mounted) {
      if (seen.has(host)) continue;
      controls.remove();
      mounted.delete(host);
    }
    position();
  }

  // Suno hydrates its server-rendered song rows. Wait for its client router to mount
  // before inserting siblings beside React-owned titles.
  const nextMarker = "next-route-announcer, #__next-route-announcer__";
  let ready = !document.querySelector('script[src*="/_next/"]') || !!document.querySelector(nextMarker);
  function schedule() { if (ready && !frame) frame = requestAnimationFrame(sync); }
  function relevant(node) {
    return node.nodeType === Node.ELEMENT_NODE && (node.matches(watch) || node.querySelector(watch));
  }
  new MutationObserver(records => {
    if (!ready) {
      if (document.querySelector(nextMarker)) { ready = true; schedule(); }
      return;
    }
    for (const rec of records) {
      if (menu.contains(rec.target)) continue;
      if (rec.type === "attributes" || rec.target.parentElement?.closest(".clip-title-wrapper, h1") ||
          [...rec.addedNodes, ...rec.removedNodes].some(relevant) ||
          [...rec.removedNodes].some(node => node.classList?.contains("suno-song-controls"))) {
        schedule();
        break;
      }
    }
  }).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["href", "data-clip-id", "data-song-id"]
  });
  window.navigation?.addEventListener("currententrychange", schedule);
  addEventListener("popstate", schedule);
  schedule();
})();
