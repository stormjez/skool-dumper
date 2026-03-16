const SERVER = "http://127.0.0.1:59876";

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  // Controlla server
  let serverOk = false;
  try {
    await fetch(`${SERVER}/download`, { method: "OPTIONS" });
    serverOk = true;
  } catch (e) {}

  // Ottieni dati video
  chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_DATA" }, (res) => {
    const status = document.getElementById("status");
    const btn = document.getElementById("dl-btn");

    if (!serverOk) {
      status.innerHTML = '<span class="err">❌ Server non attivo.</span><br><span style="color:#888;font-size:11px;">Avvia skool-server.py nel Terminal.</span>';
      return;
    }
    if (chrome.runtime.lastError || !res || !res.m3u8) {
      status.innerHTML = '<span style="color:#888">Nessun video in questa pagina.</span>';
      return;
    }

    status.innerHTML = `<span class="ok">✅ ${res.title}</span><br><span style="color:#888;font-size:11px;">Il download parte automaticamente.<br>Usa il bottone per forzare.</span>`;
    btn.disabled = false;

    btn.onclick = () => {
      chrome.tabs.sendMessage(tab.id, { type: "START_DOWNLOAD" });
      status.innerHTML = '<span class="warn">⏳ Download avviato...</span>';
      btn.disabled = true;
    };
  });
}

init();
