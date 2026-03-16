const SERVER = "http://127.0.0.1:59876";

let lastVideoId = null;
let currentVideoData = null;
let courseChildren = null;
let courseName = null;

function findModuleWithPath(children, moduleId, sectionName) {
  if (!children) return null;
  for (const child of children) {
    if (child.course?.unitType === "set") {
      const found = findModuleWithPath(child.children, moduleId, child.course.metadata?.title || "");
      if (found) return found;
    } else if (child.course?.id === moduleId) {
      return { module: child.course, section: sectionName };
    }
  }
  return null;
}

function getFlatModules(children, result = []) {
  if (!children) return result;
  for (const child of children) {
    if (child.course?.unitType === "set") getFlatModules(child.children, result);
    else result.push(child.course);
  }
  return result;
}

function getNextModule(children, currentModuleId) {
  const flat = getFlatModules(children);
  const idx = flat.findIndex(m => m?.id === currentModuleId);
  if (idx === -1 || idx === flat.length - 1) return null;
  return flat[idx + 1];
}

// Converte il formato ProseMirror/TipTap di Skool in Markdown
function slateToMarkdown(raw) {
  return prosemirrorToMarkdown(raw);
}

function prosemirrorToMarkdown(raw) {
  try {
    const clean = raw.replace(/^\[v2\]/, "").trim();
    const nodes = JSON.parse(clean);
    if (!Array.isArray(nodes)) return raw;
    return nodes.map(n => pmNodeToMd(n, 0)).filter(Boolean).join("\n\n").trim();
  } catch(e) {
    return raw;
  }
}

function pmNodeToMd(node, depth) {
  if (!node) return "";
  switch(node.type) {
    case "paragraph":
      return (node.content || []).map(c => pmNodeToMd(c, depth)).join("");
    case "text": {
      let t = node.text || "";
      for (const m of (node.marks || [])) {
        if (m.type === "bold")   t = `**${t}**`;
        if (m.type === "italic") t = `_${t}_`;
        if (m.type === "code")   t = `\`${t}\``;
        if (m.type === "link")   t = `[${t}](${m.attrs?.href || ""})`;
      }
      return t;
    }
    case "hardBreak": return "\n";
    case "heading": {
      const level = node.attrs?.level || 1;
      const text = (node.content || []).map(c => pmNodeToMd(c, depth)).join("");
      return "#".repeat(level) + " " + text;
    }
    case "bulletList":
    case "unorderedList":
      return (node.content || []).map(li => {
        const indent = "  ".repeat(depth);
        return (li.content || []).map((c, i) => {
          const text = pmNodeToMd(c, depth + 1);
          if (i === 0) return text.split("\n").map((l, j) => j === 0 ? `${indent}- ${l}` : `${indent}  ${l}`).join("\n");
          return text;
        }).join("\n");
      }).join("\n");
    case "orderedList":
      return (node.content || []).map((li, idx) => {
        const indent = "  ".repeat(depth);
        return (li.content || []).map((c, i) => {
          const text = pmNodeToMd(c, depth + 1);
          if (i === 0) return text.split("\n").map((l, j) => j === 0 ? `${indent}${idx+1}. ${l}` : `${indent}   ${l}`).join("\n");
          return text;
        }).join("\n");
      }).join("\n");
    case "listItem":
      return (node.content || []).map(c => pmNodeToMd(c, depth)).join("\n");
    case "blockquote":
      return (node.content || []).map(c => pmNodeToMd(c, depth)).join("\n").split("\n").map(l => `> ${l}`).join("\n");
    case "codeBlock":
      return "```\n" + (node.content || []).map(c => pmNodeToMd(c, depth)).join("") + "\n```";
    case "image":
      return `![${node.attrs?.alt || ""}](${node.attrs?.src || ""})`;
    default:
      return (node.content || []).map(c => pmNodeToMd(c, depth)).join("");
  }
}


function getVideoDataFromPageProps(pageProps) {
  if (!pageProps) return null;
  const selectedModule = pageProps.selectedModule;
  const children = pageProps.course?.children;
  const course = pageProps.course?.course;
  courseName = course?.metadata?.title || "Skool";
  courseChildren = children;

  const result = findModuleWithPath(children, selectedModule, "");
  if (!result) return null;
  const { module, section } = result;
  const meta = module.metadata;
  const title = meta?.title || "video";

  // Caso 1: Mux
  if (pageProps.video?.playbackId && pageProps.video?.playbackToken) {
    return {
      id: pageProps.video.playbackId,
      moduleId: selectedModule,
      title, section, course: courseName,
      type: "mux",
      url: `https://stream.video.skool.com/${pageProps.video.playbackId}.m3u8?token=${pageProps.video.playbackToken}`
    };
  }

  // Caso 2: Loom
  if (meta?.videoLink && meta.videoLink.includes("loom.com")) {
    return {
      id: meta.videoLink,
      moduleId: selectedModule,
      title, section, course: courseName,
      type: "loom",
      url: meta.videoLink.split("?")[0]
    };
  }

  // Caso 3: testo/desc
  if (meta?.desc && meta.desc.length > 10) {
    const markdown = slateToMarkdown(meta.desc);
    if (markdown && markdown.length > 5) {
      return {
        id: selectedModule + "_text",
        moduleId: selectedModule,
        title, section, course: courseName,
        type: "text",
        content: markdown
      };
    }
  }

  return null;
}

function getVideoDataFromDOM() {
  try {
    const nextData = document.getElementById("__NEXT_DATA__");
    if (!nextData) return null;
    const json = JSON.parse(nextData.textContent);
    return getVideoDataFromPageProps(json?.props?.pageProps);
  } catch(e) { return null; }
}

function getVideoData() {
  return currentVideoData || getVideoDataFromDOM();
}

function navigateToModule(module) {
  if (!module) return;
  const url = new URL(location.href);
  url.searchParams.set("md", module.id);
  history.pushState({}, "", url.toString());
  window.dispatchEvent(new PopStateEvent("popstate"));
}

// Intercetta fetch Next.js SPA
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const res = await originalFetch.apply(this, args);
  try {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (url.includes("/_next/data/") && url.includes("/classroom/")) {
      const clone = res.clone();
      clone.json().then(data => {
        const videoData = getVideoDataFromPageProps(data?.pageProps);
        if (videoData) {
          currentVideoData = videoData;
          handleNewVideo(videoData);
        }
      }).catch(() => {});
    }
  } catch(e) {}
  return res;
};

let pollingInterval = null;

function startPolling(data) {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    try {
      const res = await fetch(`${SERVER}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: data.url || data.id })
      });
      const json = await res.json();
      if (!json.downloading) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        onDownloadComplete(data);
      }
    } catch(e) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }, 2000);
}

function onDownloadComplete(data) {
  const next = courseChildren ? getNextModule(courseChildren, data.moduleId) : null;
  updatePanelDone(data, next);
}

function updatePanelDone(data, nextModule) {
  const panel = document.getElementById("skool-dumper-panel");
  if (!panel) return;

  const icon = data.type === "text" ? "📄" : "✅";
  const msg = data.type === "text" ? "Testo salvato" : "Completato";

  const nextHtml = nextModule
    ? `<button id="sd-next" style="
        margin-top:10px;width:100%;background:#4ade80;color:#111;border:none;
        border-radius:6px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;
      ">▶ Prossimo: ${nextModule.metadata?.title || "..."}</button>`
    : `<div style="color:#888;font-size:11px;margin-top:8px;">Fine del corso!</div>`;

  const content = panel.querySelector("#sd-content");
  if (content) {
    content.innerHTML = `
      <div style="color:#4ade80;font-size:12px;">${icon} ${msg}: <b>${data.title}</b></div>
      ${nextHtml}
    `;
    document.getElementById("sd-next")?.addEventListener("click", () => {
      if (pollingInterval) clearInterval(pollingInterval);
      panel.remove();
      navigateToModule(nextModule);
    });
  }
}

function createPanel(data, state) {
  const existing = document.getElementById("skool-dumper-panel");
  if (existing) existing.remove();

  const panel = document.createElement("div");
  panel.id = "skool-dumper-panel";
  panel.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 999999;
    background: #1a1a2e; border: 1px solid #e94560; border-radius: 12px;
    padding: 14px 18px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px; color: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    min-width: 280px; max-width: 360px;
  `;

  const typeIcon = { mux: "🎬", loom: "🎥", text: "📄" }[data?.type] || "🎬";
  const sectionLabel = data?.section
    ? `<div style="color:#888;font-size:11px;margin-bottom:4px;">${data.course} › ${data.section}</div>`
    : `<div style="color:#888;font-size:11px;margin-bottom:4px;">${data?.course || ""}</div>`;

  const stateHtml = {
    downloading: `${sectionLabel}<div style="color:#facc15;font-size:12px;">⏳ Download in corso: <b>${data?.title}</b> ${typeIcon}</div>`,
    saving:      `${sectionLabel}<div style="color:#facc15;font-size:12px;">💾 Salvataggio testo: <b>${data?.title}</b> ${typeIcon}</div>`,
    noserver:    `<div style="color:#f87171;font-size:12px;">❌ Server non raggiungibile.</div>`,
    novideo:     `<div style="color:#888;font-size:12px;">Nessun contenuto scaricabile qui.</div>`,
  }[state] || "";

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:18px;">🎬</span>
      <span style="font-weight:700;color:#e94560;font-size:14px;">Skool Dumper</span>
      <button id="sd-close" style="margin-left:auto;background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:0;">✕</button>
    </div>
    <div id="sd-content">${stateHtml}</div>
  `;

  document.body.appendChild(panel);
  document.getElementById("sd-close").onclick = () => {
    if (pollingInterval) clearInterval(pollingInterval);
    panel.remove();
  };
}

async function startDownload(data) {
  const stateLabel = data.type === "text" ? "saving" : "downloading";
  createPanel(data, stateLabel);

  try {
    const res = await fetch(`${SERVER}/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: data.url || "",
        title: data.title,
        type: data.type,
        course: data.course,
        section: data.section,
        content: data.content || ""
      })
    });
    if (!res.ok) throw new Error();
    const json = await res.json();
    if (json.status === "started" || json.status === "already_downloading") {
      startPolling(data);
    }
  } catch(e) {
    createPanel(data, "noserver");
  }
}

function handleNewVideo(data) {
  if (!data) return;
  if (data.id === lastVideoId) return;
  lastVideoId = data.id;
  startDownload(data);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_VIDEO_DATA") sendResponse(getVideoData());
  if (msg.type === "START_DOWNLOAD") {
    const data = getVideoData();
    if (data) { lastVideoId = null; handleNewVideo(data); }
    sendResponse({ ok: !!data });
  }
  return true;
});

handleNewVideo(getVideoDataFromDOM());

let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => {
      const data = getVideoDataFromDOM();
      if (data) { currentVideoData = data; handleNewVideo(data); }
    }, 800);
  }
}, 300);
