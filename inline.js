(() => {
  const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  const rowSelector = '.clip-row, [data-clip-id], [data-song-id], [data-testid="clip-row"], [data-testid="song-row"]';
  const linkSelector = 'a[href*="/song/"]';
  const watch = rowSelector + ", " + linkSelector + ", h1";
  const mounted = new Map();
  const pending = new Map();
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
      if (event.isTrusted && selected) download(selected, format);
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

  async function download(track, format) {
    if (pending.has(track.id)) return;
    const waiting = "正在准备 " + format.toUpperCase() + "，请稍候…";
    pending.set(track.id, waiting);
    showStatus(waiting, true);
    let message;
    try {
      const result = await chrome.runtime.sendMessage({ type: "inline-download", id: track.id, format });
      message = result?.ok ? "已保存 " + format.toUpperCase() + " 文件。" : result?.error || "下载失败，请重试。";
    } catch {
      message = "扩展连接已中断。请刷新 Suno 页面后重试。";
    } finally {
      pending.delete(track.id);
      if (selected?.id === track.id) showStatus(message);
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
    title.textContent = track.name || "下载这首歌";
    showStatus(pending.get(track.id) || "选择格式后，歌曲 ID 将发送给 ai-suno.com。", pending.has(track.id));
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
      entry = { button, track };
      mounted.set(host, entry);
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup", "dblclick"]) {
        button.addEventListener(type, event => event.stopPropagation());
      }
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.isTrusted) open(button, entry.track);
      });
    }
    if (entry.track.id !== track.id && entry.button === trigger && menu.matches(":popover-open")) menu.hidePopover();
    entry.track = track;
    entry.button.setAttribute("aria-label", "下载 " + (track.name || "这首歌"));
    if (inside) {
      if (entry.button.parentElement !== host) host.append(entry.button);
    } else if (host.nextElementSibling !== entry.button) {
      host.after(entry.button);
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
    for (const [host, { button }] of mounted) {
      if (seen.has(host)) continue;
      button.remove();
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
          [...rec.removedNodes].some(node => node.classList?.contains("suno-single-download-trigger"))) {
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
