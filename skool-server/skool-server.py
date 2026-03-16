#!/usr/bin/env python3

from http.server import HTTPServer, BaseHTTPRequestHandler
import json, subprocess, os, threading, re, sys, shutil, platform

PORT = 59876
DOWNLOAD_DIR = os.path.expanduser("~/Desktop/SkoolDump")
IS_WINDOWS = platform.system() == "Windows"

# Trova automaticamente yt-dlp e ffmpeg
def find_bin(name):
    # Prima cerca nel PATH
    found = shutil.which(name)
    if found:
        return found
    # Fallback percorsi comuni
    if IS_WINDOWS:
        candidates = [
            os.path.expanduser(f"~/AppData/Local/Microsoft/WinGet/Packages/{name}"),
            f"C:\\yt-dlp\\{name}.exe",
            f"C:\\ffmpeg\\bin\\{name}.exe",
            os.path.expanduser(f"~/Downloads/{name}.exe"),
        ]
    else:
        candidates = [
            f"/opt/homebrew/bin/{name}",
            f"/usr/local/bin/{name}",
            f"/usr/bin/{name}",
        ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return name  # fallback: spera che sia nel PATH

YT_DLP = find_bin("yt-dlp")
FFMPEG = find_bin("ffmpeg")

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

active = {}
active_lock = threading.Lock()

def safe_name(s):
    s = (s or "").strip()
    s = re.sub(r'[/\\:*?"<>|]', '', s)
    return s[:60] or "untitled"

def make_folder(course, section):
    parts = [DOWNLOAD_DIR]
    if course: parts.append(safe_name(course))
    if section: parts.append(safe_name(section))
    folder = os.path.join(*parts)
    os.makedirs(folder, exist_ok=True)
    return folder

def notify(message):
    try:
        if IS_WINDOWS:
            # Usa PowerShell toast su Windows
            ps_cmd = f'[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms"); [System.Windows.Forms.MessageBox]::Show("{message}", "Skool Dumper")'
            # Alternativa silenziosa: solo print
            print(f"[skool-server] {message}")
        else:
            os.system(f"osascript -e 'display notification \"{message}\" with title \"Skool Dumper\"'")
    except:
        pass

class Handler(BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception:
            self.respond(400, {"error": "invalid json"})
            return
        if self.path == "/download":
            self.handle_download(data)
        elif self.path == "/status":
            self.handle_status(data)
        else:
            self.respond(404, {"error": "not found"})

    def handle_status(self, data):
        key = data.get("url") or data.get("id", "")
        with active_lock:
            running = key in active
        self.respond(200, {"downloading": running})

    def handle_download(self, data):
        url = data.get("url", "").strip()
        title = safe_name(data.get("title", "untitled"))
        course = data.get("course", "")
        section = data.get("section", "")
        video_type = data.get("type", "mux")
        content = data.get("content", "")
        key = url if url else data.get("id", title)

        with active_lock:
            if key in active:
                self.respond(200, {"status": "already_downloading"})
                return
            active[key] = title

        self.respond(200, {"status": "started", "title": title})
        t = threading.Thread(
            target=self.run_task,
            args=(key, url, title, course, section, video_type, content),
            daemon=True
        )
        t.start()

    def run_task(self, key, url, title, course, section, video_type, content):
        folder = make_folder(course, section)
        try:
            if video_type == "text":
                output_path = os.path.join(folder, f"{title}.md")
                with open(output_path, "w", encoding="utf-8") as f:
                    f.write(f"# {title}\n\n{content}\n")
                print(f"[skool-server] Testo salvato: {course}/{section}/{title}")
                notify(f"Testo salvato: {title}")
            else:
                output_path = os.path.join(folder, f"{title}.mp4")
                if video_type == "mux":
                    cmd = [
                        YT_DLP, "-N", "16",
                        "-f", "bestvideo+bestaudio/best",
                        "--referer", "https://skool.com",
                        "--add-header", "Origin: https://skool.com",
                        "--merge-output-format", "mp4",
                        "--ffmpeg-location", FFMPEG,
                        "--postprocessor-args", "ffmpeg:-movflags +faststart",
                        "-o", output_path, url
                    ]
                else:  # loom
                    cmd = [
                        YT_DLP, "-N", "8",
                        "--merge-output-format", "mp4",
                        "--ffmpeg-location", FFMPEG,
                        "-o", output_path, url
                    ]
                print(f"[skool-server] Scaricando ({video_type}): {course}/{section}/{title}")
                subprocess.run(cmd, check=True)
                print(f"[skool-server] Completato: {title}")
                notify(f"Completato: {title}")
        except Exception as e:
            print(f"[skool-server] Errore: {e}")
            notify(f"Errore: {title}")
        finally:
            with active_lock:
                active.pop(key, None)

    def respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

if __name__ == "__main__":
    print(f"[skool-server] OS: {platform.system()}")
    print(f"[skool-server] yt-dlp: {YT_DLP}")
    print(f"[skool-server] ffmpeg: {FFMPEG}")
    print(f"[skool-server] In ascolto su http://127.0.0.1:{PORT}")
    print(f"[skool-server] Download in: {DOWNLOAD_DIR}")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    server.serve_forever()
