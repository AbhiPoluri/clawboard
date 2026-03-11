import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./index.css";

type Tab = "status" | "config" | "setup";

interface Config {
  llm?: { provider?: string; api_key?: string; model?: string };
  [key: string]: unknown;
}

function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [configText, setConfigText] = useState("{}");
  const [config, setConfig] = useState<Config>({});
  const [doctorOutput, setDoctorOutput] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    checkInstalled();
    loadConfig();
  }, []);

  async function checkInstalled() {
    const ok: boolean = await invoke("openclaw_installed");
    setInstalled(ok);
    if (ok) checkStatus();
  }

  async function checkStatus() {
    try {
      const raw: string = await invoke("openclaw_status");
      const parsed = JSON.parse(raw);
      setRunning(!!parsed.running);
    } catch {
      setRunning(false);
    }
  }

  async function loadConfig() {
    const raw: string = await invoke("read_config");
    setConfigText(raw);
    try { setConfig(JSON.parse(raw)); } catch { /* ignore */ }
  }

  async function saveConfig() {
    try {
      await invoke("write_config", { content: configText });
      setSaveMsg("Saved.");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg(`Error: ${e}`);
    }
  }

  async function runDoctor() {
    const out: string = await invoke("openclaw_doctor");
    setDoctorOutput(out);
  }

  async function toggleAgent() {
    if (running) {
      await invoke("openclaw_stop");
    } else {
      await invoke("openclaw_start");
    }
    setTimeout(checkStatus, 1000);
  }

  const apiKey = config.llm?.api_key ?? "";
  const provider = config.llm?.provider ?? "anthropic";
  const model = config.llm?.model ?? "";

  function updateConfigField(path: string[], value: string) {
    try {
      const parsed: Config = JSON.parse(configText);
      let obj: Record<string, unknown> = parsed as Record<string, unknown>;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]] as Record<string, unknown>;
      }
      obj[path[path.length - 1]] = value;
      const updated = JSON.stringify(parsed, null, 2);
      setConfigText(updated);
      setConfig(parsed);
    } catch { /* ignore */ }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono text-sm flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800">
        <span className="text-lg">🦞</span>
        <span className="font-semibold text-zinc-200 tracking-tight">Clawboard</span>
        <span className="text-xs text-zinc-500 ml-auto">OpenClaw UI</span>
      </div>

      <div className="flex gap-1 px-5 pt-3">
        {(["status", "config", "setup"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
              tab === t
                ? "bg-orange-500 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 overflow-auto">

        {tab === "status" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${installed ? "bg-green-400" : "bg-red-400"}`} />
              <span className="text-zinc-300">
                openclaw {installed === null ? "checking..." : installed ? "installed" : "not installed"}
              </span>
            </div>

            {installed && (
              <>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
                  <span className="text-zinc-300">agent {running ? "running" : "stopped"}</span>
                  <button
                    onClick={toggleAgent}
                    className={`ml-auto px-3 py-1 rounded text-xs ${
                      running
                        ? "bg-red-900 text-red-300 hover:bg-red-800"
                        : "bg-green-900 text-green-300 hover:bg-green-800"
                    }`}
                  >
                    {running ? "Stop" : "Start"}
                  </button>
                  <button onClick={checkStatus} className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                    Refresh
                  </button>
                </div>
                <div>
                  <button onClick={runDoctor} className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                    Run openclaw doctor
                  </button>
                  {doctorOutput && (
                    <pre className="mt-2 p-3 bg-zinc-900 rounded text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">
                      {doctorOutput}
                    </pre>
                  )}
                </div>
              </>
            )}

            {installed === false && (
              <div className="p-3 bg-zinc-900 rounded text-zinc-400 text-xs">
                OpenClaw is not installed. Visit <span className="text-orange-400">openclaw.ai</span> to get started, then come back here.
              </div>
            )}
          </div>
        )}

        {tab === "config" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => updateConfigField(["llm", "provider"], e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                  <option value="ollama">Ollama (local)</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => updateConfigField(["llm", "api_key"], e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                  placeholder="claude-sonnet-4-6"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Raw JSON</label>
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                rows={10}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs font-mono focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveConfig} className="px-4 py-1.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600">
                Save config
              </button>
              {saveMsg && <span className="text-xs text-zinc-400">{saveMsg}</span>}
            </div>
          </div>
        )}

        {tab === "setup" && (
          <div className="space-y-4 text-xs text-zinc-400">
            <p className="text-zinc-200 font-semibold">Getting started</p>
            <ol className="space-y-3 list-decimal list-inside">
              <li>Install OpenClaw: <code className="bg-zinc-800 px-1 rounded">npm i -g openclaw</code></li>
              <li>Add your API key in the <button onClick={() => setTab("config")} className="text-orange-400 underline">Config</button> tab</li>
              <li>Run <code className="bg-zinc-800 px-1 rounded">openclaw doctor</code> from the <button onClick={() => setTab("status")} className="text-orange-400 underline">Status</button> tab</li>
              <li>Hit <span className="text-green-400">Start</span> and your agent is live</li>
            </ol>
            <div className="p-3 bg-zinc-900 rounded mt-4">
              <p className="text-zinc-300 mb-1">Config file location</p>
              <code className="text-zinc-400">~/.openclaw/openclaw.json</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
