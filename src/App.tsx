import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./index.css";

type Tab = "status" | "config" | "setup";

interface Config {
  llm?: { provider?: string; api_key?: string; model?: string };
  [key: string]: unknown;
}

const POPULAR_OLLAMA_MODELS = [
  "llama3.2", "llama3.1", "mistral", "phi4", "gemma3", "qwen2.5", "deepseek-r1"
];

function App() {
  const [tab, setTab] = useState<Tab>("status");
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [configText, setConfigText] = useState("{}");
  const [config, setConfig] = useState<Config>({});
  const [doctorOutput, setDoctorOutput] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [ollamaInstalled, setOllamaInstalled] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [pulling, setPulling] = useState(false);
  const [pullTarget, setPullTarget] = useState("llama3.2");
  const [pullMsg, setPullMsg] = useState("");

  useEffect(() => {
    checkInstalled();
    loadConfig();
    checkOllama();
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
    if (running) await invoke("openclaw_stop");
    else await invoke("openclaw_start");
    setTimeout(checkStatus, 1000);
  }

  async function checkOllama() {
    const ok: boolean = await invoke("ollama_installed");
    setOllamaInstalled(ok);
    if (ok) {
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
    }
  }

  async function pullModel() {
    setPulling(true);
    setPullMsg("Pulling... this may take a minute.");
    try {
      await invoke("ollama_pull", { model: pullTarget });
      setPullMsg(`Done! ${pullTarget} is ready.`);
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
      // auto-set config to ollama + this model
      updateConfigFields({ llm: { provider: "ollama", model: pullTarget, api_key: "" } });
    } catch (e) {
      setPullMsg(`Error: ${e}`);
    }
    setPulling(false);
    setTimeout(() => setPullMsg(""), 4000);
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

  function updateConfigFields(patch: Partial<Config>) {
    try {
      const parsed: Config = { ...JSON.parse(configText), ...patch };
      if (patch.llm) parsed.llm = { ...parsed.llm, ...patch.llm };
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
              tab === t ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 px-5 py-4 overflow-auto">

        {/* STATUS */}
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
                  <button onClick={toggleAgent} className={`ml-auto px-3 py-1 rounded text-xs ${running ? "bg-red-900 text-red-300 hover:bg-red-800" : "bg-green-900 text-green-300 hover:bg-green-800"}`}>
                    {running ? "Stop" : "Start"}
                  </button>
                  <button onClick={checkStatus} className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Refresh</button>
                </div>
                <div>
                  <button onClick={runDoctor} className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Run openclaw doctor</button>
                  {doctorOutput && (
                    <pre className="mt-2 p-3 bg-zinc-900 rounded text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">{doctorOutput}</pre>
                  )}
                </div>
              </>
            )}
            {installed === false && (
              <div className="p-3 bg-zinc-900 rounded text-zinc-400 text-xs">
                OpenClaw not installed. Visit <span className="text-orange-400">openclaw.ai</span> to get started.
              </div>
            )}
          </div>
        )}

        {/* CONFIG */}
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
                  <option value="ollama">Ollama (local, free)</option>
                </select>
              </div>

              {provider !== "ollama" && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => updateConfigField(["llm", "api_key"], e.target.value)}
                    placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Model</label>
                {provider === "ollama" ? (
                  <select
                    value={model}
                    onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
                  >
                    {ollamaModels.length === 0 && <option value="">No local models — pull one below</option>}
                    {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                  />
                )}
              </div>
            </div>

            {/* Ollama section */}
            {provider === "ollama" && (
              <div className="p-3 bg-zinc-900 rounded space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${ollamaInstalled ? "bg-green-400" : "bg-red-400"}`} />
                  <span className="text-xs text-zinc-400">
                    Ollama {ollamaInstalled ? `installed · ${ollamaModels.length} model${ollamaModels.length !== 1 ? "s" : ""}` : "not installed"}
                  </span>
                  {!ollamaInstalled && (
                    <a className="text-xs text-orange-400 ml-auto" href="https://ollama.ai">ollama.ai</a>
                  )}
                </div>

                {ollamaInstalled && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">Pull a model</p>
                    <div className="flex gap-2">
                      <select
                        value={pullTarget}
                        onChange={(e) => setPullTarget(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs focus:outline-none"
                      >
                        {POPULAR_OLLAMA_MODELS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <button
                        onClick={pullModel}
                        disabled={pulling}
                        className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {pulling ? "Pulling..." : "Pull"}
                      </button>
                    </div>
                    {pullMsg && <p className="text-xs text-zinc-400">{pullMsg}</p>}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Raw JSON</label>
              <textarea
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                rows={8}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs font-mono focus:outline-none focus:border-orange-500 resize-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={saveConfig} className="px-4 py-1.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600">Save config</button>
              {saveMsg && <span className="text-xs text-zinc-400">{saveMsg}</span>}
            </div>
          </div>
        )}

        {/* SETUP */}
        {tab === "setup" && (
          <div className="space-y-4 text-xs text-zinc-400">
            <p className="text-zinc-200 font-semibold">Getting started</p>
            <ol className="space-y-3 list-decimal list-inside">
              <li>Install OpenClaw: <code className="bg-zinc-800 px-1 rounded">npm i -g openclaw</code></li>
              <li>Choose a provider in <button onClick={() => setTab("config")} className="text-orange-400 underline">Config</button> — use Ollama for fully local/free</li>
              <li>Run openclaw doctor from <button onClick={() => setTab("status")} className="text-orange-400 underline">Status</button> to validate</li>
              <li>Hit <span className="text-green-400">Start</span> — your agent is live</li>
            </ol>
            <div className="p-3 bg-zinc-900 rounded space-y-1">
              <p className="text-zinc-300">Want free local AI?</p>
              <p>Select <span className="text-orange-400">Ollama</span> as provider, install Ollama from <span className="text-orange-400">ollama.ai</span>, then pull a model — no API key needed.</p>
            </div>
            <div className="p-3 bg-zinc-900 rounded">
              <p className="text-zinc-300 mb-1">Config file</p>
              <code className="text-zinc-400">~/.openclaw/openclaw.json</code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
