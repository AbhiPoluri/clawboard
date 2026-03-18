# Clawboard

A Tauri desktop app for managing and monitoring [OpenClaw](https://github.com/abhipoluri/openclaw) — an AI agent that responds to messages across multiple messaging platforms (iMessage, WhatsApp, Telegram, Discord, Slack).

<!-- Screenshot placeholder -->
<!-- ![Clawboard Screenshot](docs/screenshot.png) -->

---

## Features

- **Multi-provider AI support** — Anthropic, OpenAI, Ollama (local), vLLM
- **Model parameters** — Temperature, Max Tokens, Top-P sliders with per-provider defaults
- **Persona editor** — Custom system prompt, tone, and response length settings
- **Channel management** — Connect/disconnect messaging platforms with token input and per-channel testing
- **Live log viewer** — Real-time log streaming with search, filtering (errors/warnings/info), and export
- **Conversation history** — Browse past agent interactions grouped by channel with expandable view
- **Settings backup** — Export and import the full config + persona as a single JSON file
- **Keyboard shortcuts** — ⌘1–6 for tabs, ⌘L for logs, ⌘, for config

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | [Tauri 2](https://tauri.app) (Rust) |
| Frontend | React 19, TypeScript 5.8 |
| Styling | Tailwind CSS 4 |
| Bundler | Vite 7 |
| Rust deps | serde, rfd, which, tauri-plugin-opener |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Installation

```bash
git clone https://github.com/abhipoluri/clawboard
cd clawboard
npm install
```

### Development

```bash
npm run tauri dev
```

Starts the Vite dev server on `localhost:1420` and opens the Tauri window with hot-reload.

### Building

```bash
npm run tauri build
```

Produces a native binary and installer in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
clawboard/
├── src/
│   ├── App.tsx                # Root component, tab routing, keyboard shortcuts
│   ├── types.ts               # Shared TypeScript types
│   └── components/
│       ├── StatusTab.tsx      # Setup wizard + agent start/stop + uptime
│       ├── ChannelsTab.tsx    # Channel connect/disconnect + token management
│       ├── ConfigTab.tsx      # AI provider, model, and parameter settings
│       ├── LogsTab.tsx        # Real-time log streaming + search + export
│       ├── PersonaTab.tsx     # Agent name, system prompt, tone
│       ├── TabBar.tsx         # Tab navigation with shortcut hints
│       ├── Dot.tsx            # Live/off status indicator
│       └── Badge.tsx          # Connected/disconnected badge
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # All Tauri command handlers
│   │   └── main.rs            # App entry point
│   └── tauri.conf.json        # Window config (420×580, non-resizable)
├── package.json
└── vite.config.ts
```

---

## Configuration

All runtime config is stored in `~/.openclaw/` — no environment variables needed.

| File | Purpose |
|---|---|
| `~/.openclaw/openclaw.json` | LLM provider, API key, model, channel tokens |
| `~/.openclaw/persona.json` | Agent name, system prompt, tone |
| `~/.openclaw/history.json` | Conversation history |
| `~/.openclaw/openclaw.log` | Agent logs (streamed live in the Logs tab) |

The Config tab writes directly to these files. Use **Export Settings** to back them up.

---

## Supported Channels

| Platform | Auth method |
|---|---|
| iMessage | macOS Messages.app (no token) |
| WhatsApp | API token |
| Telegram | BotFather token |
| Discord | Bot token |
| Slack | Bot token |

---

## License

MIT
