# Skool Dumper

**Skool Dumper** is a Chrome extension + local server that automatically downloads videos and saves text content from Skool.com classrooms to your computer, organized by course and section.

---

## How It Works

Skool Dumper is made of two components that work together:

### 1. The Chrome Extension (`skool-ext/`)

The extension runs on every Skool classroom page you visit. As soon as the page loads, it reads the hidden `__NEXT_DATA__` JSON object that Next.js (the framework Skool is built on) embeds in every page. This object contains all the information about the current course, including the lesson title, section name, course name, and — most importantly — the video source.

Skool hosts videos on two different platforms:
- **Mux** — Skool's native player. The video is streamed as HLS (`.m3u8`). The extension extracts the `playbackId` and `playbackToken` from the page data and constructs the stream URL automatically. No need to open DevTools or find the URL manually.
- **Loom** — Some lessons embed Loom videos. The extension detects the Loom URL directly from the lesson metadata.

For text-only lessons (no video), the extension reads the `desc` field, which contains the lesson body in a JSON-based editor format (similar to Slate.js). It converts this to clean Markdown automatically.

When you navigate between lessons, Skool behaves as a Single Page Application — it does not reload the full page. The extension handles this in two ways:
- It intercepts all `fetch()` calls made by Next.js to `/_next/data/` endpoints, which carry the new lesson data when you click a lesson in the sidebar.
- It also polls the URL every 300ms as a fallback, and re-reads the page data when the URL changes.

Once new lesson data is detected, the extension sends it to the local server via a `POST` request to `http://127.0.0.1:59876/download`.

While the download is in progress, the extension polls the server every 2 seconds via `/status` to check if the download is complete. When it finishes, the panel updates and shows a **Next** button that navigates you to the following lesson automatically.

### 2. The Local Server (`skool-server/`)

The server is a lightweight Python HTTP server that listens on `localhost:59876`. It receives download requests from the extension and launches `yt-dlp` as a subprocess to do the actual downloading.

For each request, the server:
- Receives the video URL, title, course name, section name, and content type
- Sanitizes the file and folder names (removes illegal characters)
- Creates the output folder structure: `SkoolDump / Course Name / Section Name /`
- Runs `yt-dlp` with the appropriate flags depending on the video type:
  - **Mux**: downloads the best video and audio streams separately and merges them with `ffmpeg` into a single `.mp4`
  - **Loom**: downloads directly via `yt-dlp` without extra headers
  - **Text**: writes the Markdown content directly to a `.md` file — no yt-dlp involved
- Sends a system notification when the download completes (macOS: `osascript`, Windows: PowerShell)
- Tracks active downloads to prevent duplicate downloads if you navigate back to a lesson

The server automatically detects your operating system and finds `yt-dlp` and `ffmpeg` by searching the system PATH and common installation directories on both macOS and Windows.

---

## Output Structure

```
~/Desktop/SkoolDump/
└── Course Name/
    ├── Section Name/
    │   ├── Lesson Title.mp4
    │   ├── Another Lesson.mp4
    │   └── Text Lesson.md
    └── Another Section/
        └── Lesson Title.mp4
```

---

## Requirements

- Python 3.8+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/)
- Chrome, Edge, Brave, or any Chromium-based browser

---

## Installation

### macOS

**1. Install dependencies**
```bash
brew install yt-dlp ffmpeg
```

**2. Install the server**
```bash
sudo cp skool-server/skool-server.py /usr/local/bin/skool-server.py
```

**3. Enable auto-start at login**
```bash
cp skool-server/com.skooldumper.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.skooldumper.server.plist
```

**4. Verify the server is running**
```bash
curl -X OPTIONS http://127.0.0.1:59876/download
```

---

### Windows

**1. Install dependencies**
- Download [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) and add it to your PATH
- Download [ffmpeg](https://ffmpeg.org/download.html) and add it to your PATH
- Make sure Python is installed: [python.org](https://www.python.org/)

**2. Start the server**

Double-click `skool-server/start-windows.bat`

**3. Enable auto-start at login (optional)**

Run `skool-server/install-autostart-windows.bat` as Administrator

---

### Install the Chrome Extension (all platforms)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `skool-ext` folder

---

## Usage

1. Make sure the server is running
2. Open any Skool classroom lesson in Chrome
3. The extension detects the content automatically and starts downloading
4. A panel appears in the bottom-right corner showing download progress
5. When the download finishes, click **Next** to move to the next lesson automatically

Files are saved to `~/Desktop/SkoolDump/CourseName/SectionName/LessonName.mp4`

---

## Notes

- Only works for content you already have legitimate access to
- Mux video tokens expire quickly — the extension always reads a fresh token directly from the page, so this is handled automatically
- Loom videos require no authentication token
- Text content is converted from Skool's internal editor format to standard Markdown

---

## License

MIT
