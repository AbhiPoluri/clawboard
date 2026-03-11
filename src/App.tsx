import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./index.css";

type Tab = "status" | "channels" | "logs" | "config";
type Provider = "anthropic" | "openai" | "ollama" | "vllm";
type Step = "check" | "install_node" | "install_openclaw" | "config" | "ready";

interface Config {
  llm?: { provider?: string; api_key?: string; model?: string; base_url?: string };
  [key: string]: unknown;
}

interface ChannelStatus {
  name: string;
  connected: boolean;
  description: string;
}

const CHANNEL_ICONS: Record<string, string> = {
  imessage: "💬", whatsapp: "🟢", telegram: "✈️", discord: "🎮", slack: "⚡"
};

const CHANNEL_SETUP: Record<string, { label: string; placeholder: string; url?: string; note?: string }> = {
  imessage: { label: "No token needed", placeholder: "", note: "Requires macOS — enabled automatically when openclaw runs." },
  whatsapp: { label: "WhatsApp token", placeholder: "Paste token from openclaw whatsapp:setup", url: "https://docs.openclaw.ai/channels/whatsapp" },
  telegram: { label: "Bot token", placeholder: "123456:ABC-DEF...", url: "https://t.me/botfather", note: "Create a bot with @BotFather, paste the token." },
  discord: { label: "Bot token", placeholder: "MTA0...", url: "https://discord.com/developers/applications", note: "Create a bot in Discord Dev Portal, copy Bot Token." },
  slack: { label: "Bot token", placeholder: "xoxb-...", url: "https://api.slack.com/apps", note: "Create a Slack app, install to workspace, copy Bot User OAuth Token." },
};

const POPULAR_OLLAMA_MODELS = ["llama3.2", "llama3.1", "mistral", "phi4", "gemma3", "qwen2.5", "deepseek-r1"];

function Dot({ ok, pulse }: { ok: boolean; pulse?: boolean }) {
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : "bg-zinc-600"} ${pulse && ok ? "animate-pulse" : ""}`} />;
}

function Badge({ ok }: { ok: boolean }) {
  return <span className={`text-xs px-1.5 py-0.5 rounded ${ok ? "bg-green-900 text-green-300" : "bg-zinc-800 text-zinc-500"}`}>{ok ? "connected" : "off"}</span>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("status");

  // Setup flow
  const [nodeOk, setNodeOk] = useState<boolean | null>(null);
  const [clawOk, setClawOk] = useState<boolean | null>(null);
  const [configOk, setConfigOk] = useState(false);
  const [step, setStep] = useState<Step>("check");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");

  // Runtime
  const [running, setRunning] = useState(false);
  const [doctorOutput, setDoctorOutput] = useState("");

  // Config
  const [configText, setConfigText] = useState("{}");
  const [config, setConfig] = useState<Config>({});
  const [saveMsg, setSaveMsg] = useState("");

  // Channels
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [channelTokens, setChannelTokens] = useState<Record<string, string>>({});
  const [channelMsg, setChannelMsg] = useState<Record<string, string>>({});

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);

  // Ollama
  const [ollamaOk, setOllamaOk] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [pullTarget, setPullTarget] = useState("llama3.2");
  const [pullMsg, setPullMsg] = useState("");
  const [pulling, setPulling] = useState(false);

  // vLLM
  const [vllmBaseUrl, setVllmBaseUrl] = useState("http://localhost:8000");
  const [vllmRunning, setVllmRunning] = useState(false);
  const [vllmModels, setVllmModels] = useState<string[]>([]);
  const [vllmChecking, setVllmChecking] = useState(false);

  useEffect(() => { runChecks(); }, []);

  // Auto-scroll logs
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  async function runChecks() {
    setStep("check");
    const node: boolean = await invoke("node_installed");
    setNodeOk(node);
    if (!node) { setStep("install_node"); return; }

    const claw: boolean = await invoke("openclaw_installed");
    setClawOk(claw);
    if (!claw) { setStep("install_openclaw"); return; }

    await loadConfig();
    await checkStatus();
    await checkOllama();
    await loadChannels();
  }

  async function checkStatus() {
    try {
      const raw: string = await invoke("openclaw_status");
      setRunning(!!(JSON.parse(raw).running));
    } catch { setRunning(false); }
  }

  async function loadConfig() {
    const raw: string = await invoke("read_config");
    setConfigText(raw);
    try {
      const parsed = JSON.parse(raw);
      setConfig(parsed);
      if (parsed.llm?.base_url) setVllmBaseUrl(parsed.llm.base_url);
      if (parsed.llm?.provider) { setConfigOk(true); setStep("ready"); }
      else setStep("config");
    } catch { setStep("config"); }
  }

  async function saveConfig() {
    try {
      await invoke("write_config", { content: configText });
      setSaveMsg("Saved.");
      setConfigOk(true);
      setStep("ready");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) { setSaveMsg(`Error: ${e}`); }
  }

  async function loadChannels() {
    const ch: ChannelStatus[] = await invoke("get_channel_statuses");
    setChannels(ch);
  }

  async function toggleChannel(ch: ChannelStatus) {
    if (ch.connected) {
      await invoke("disable_channel", { channel: ch.name });
    } else {
      if (ch.name === "imessage") {
        await invoke("enable_channel", { channel: ch.name, token: "" });
      } else {
        setExpandedChannel(expandedChannel === ch.name ? null : ch.name);
        return;
      }
    }
    await loadChannels();
  }

  async function connectChannel(name: string) {
    const token = channelTokens[name] ?? "";
    try {
      await invoke("enable_channel", { channel: name, token });
      setChannelMsg({ ...channelMsg, [name]: "Connected!" });
      setExpandedChannel(null);
      await loadChannels();
    } catch (e) {
      setChannelMsg({ ...channelMsg, [name]: `Error: ${e}` });
    }
    setTimeout(() => setChannelMsg((m) => ({ ...m, [name]: "" })), 3000);
  }

  async function startStreaming() {
    if (streaming) return;
    const existing: string = await invoke("read_logs", { lines: 100 });
    if (existing) setLogs(existing.split("\n").filter(Boolean));
    await invoke("stream_logs");
    setStreaming(true);
    listen<string>("log-line", (e) => {
      setLogs((prev) => [...prev.slice(-499), e.payload]);
    });
  }

  async function installOpenclaw() {
    setInstalling(true);
    setInstallMsg("Installing openclaw...");
    try {
      const msg: string = await invoke("install_openclaw");
      setInstallMsg(msg);
      setClawOk(true);
      setStep("config");
    } catch (e) { setInstallMsg(`Failed: ${e}`); }
    setInstalling(false);
  }

  async function checkOllama() {
    const ok: boolean = await invoke("ollama_installed");
    setOllamaOk(ok);
    if (ok) {
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
    }
  }

  async function pullModel() {
    setPulling(true);
    setPullMsg("Starting pull...");
    listen<string>("pull-progress", (e) => setPullMsg(e.payload));
    try {
      await invoke("ollama_pull", { model: pullTarget });
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
      updateConfigFields({ llm: { provider: "ollama", model: pullTarget, api_key: "" } });
    } catch (e) { setPullMsg(`Error: ${e}`); }
    setPulling(false);
  }

  async function checkVllm() {
    setVllmChecking(true);
    const ok: boolean = await invoke("vllm_check", { baseUrl: vllmBaseUrl });
    setVllmRunning(ok);
    if (ok) {
      const models: string[] = await invoke("vllm_list_models", { baseUrl: vllmBaseUrl });
      setVllmModels(models);
      if (models.length > 0) updateConfigField(["llm", "model"], models[0]);
      updateConfigField(["llm", "base_url"], vllmBaseUrl);
    }
    setVllmChecking(false);
  }

  const provider = (config.llm?.provider ?? "anthropic") as Provider;
  const apiKey = config.llm?.api_key ?? "";
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
      const parsed: Config = JSON.parse(configText);
      if (patch.llm) parsed.llm = { ...parsed.llm, ...patch.llm };
      const updated = JSON.stringify(parsed, null, 2);
      setConfigText(updated);
      setConfig(parsed);
    } catch { /* ignore */ }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "channels", label: "Channels" },
    { id: "logs", label: "Logs" },
    { id: "config", label: "Config" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono text-sm flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950">
        <span>🦞</span>
        <span className="font-semibold text-zinc-200 text-xs tracking-wide">CLAWBOARD</span>
        <div className="ml-auto flex items-center gap-1">
          <Dot ok={running} pulse />
          <span className="text-xs text-zinc-500">{running ? "live" : "off"}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => { setTab(id); if (id === "logs") startStreaming(); }}
            className={`flex-1 py-2 text-xs transition-colors ${tab === id ? "text-orange-400 border-b-2 border-orange-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">

        {/* ── STATUS ── */}
        {tab === "status" && (
          <div className="p-4 space-y-4">
            {step === "check" && <p className="text-xs text-zinc-500 animate-pulse">Checking setup...</p>}

            {step === "install_node" && (
              <div className="space-y-3">
                <p className="text-zinc-200 font-semibold text-xs">Step 1 — Install Node.js</p>
                <p className="text-xs text-zinc-500">Required to install OpenClaw.</p>
                <button onClick={() => { invoke("install_ollama"); window.open("https://nodejs.org/en/download"); }}
                  className="w-full py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600">
                  Open nodejs.org →
                </button>
                <button onClick={runChecks} className="w-full py-2 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                  I installed it — retry
                </button>
              </div>
            )}

            {step === "install_openclaw" && (
              <div className="space-y-3">
                <p className="text-zinc-200 font-semibold text-xs">Step 2 — Install OpenClaw</p>
                <button onClick={installOpenclaw} disabled={installing}
                  className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
                  {installing ? "Installing..." : "Install OpenClaw"}
                </button>
                {installMsg && <p className="text-xs text-zinc-400">{installMsg}</p>}
              </div>
            )}

            {step === "config" && (
              <div className="space-y-3">
                <p className="text-zinc-200 font-semibold text-xs">Step 3 — Connect AI</p>
                <p className="text-xs text-zinc-500">Choose a model provider to activate your agent.</p>
                <button onClick={() => setTab("config")}
                  className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600">
                  Set up AI provider →
                </button>
              </div>
            )}

            {step === "ready" && (
              <div className="space-y-4">
                {/* Checklist */}
                <div className="space-y-2">
                  {[
                    { label: "Node.js", ok: !!nodeOk },
                    { label: "OpenClaw", ok: !!clawOk },
                    { label: "AI provider", ok: configOk },
                    { label: "Channels", ok: channels.some((c) => c.connected) },
                  ].map(({ label, ok }) => (
                    <div key={label} className="flex items-center gap-3">
                      <Dot ok={ok} />
                      <span className="text-xs text-zinc-400 flex-1">{label}</span>
                      {ok && <span className="text-xs text-green-500">✓</span>}
                    </div>
                  ))}
                </div>

                {/* Agent toggle */}
                <div className="p-3 bg-zinc-900 rounded flex items-center gap-3">
                  <Dot ok={running} pulse />
                  <span className="text-xs text-zinc-300 flex-1">Agent {running ? "running" : "stopped"}</span>
                  <button onClick={async () => { if (running) await invoke("openclaw_stop"); else await invoke("openclaw_start"); setTimeout(checkStatus, 800); }}
                    className={`px-4 py-1.5 rounded text-xs font-medium ${running ? "bg-red-900 text-red-300 hover:bg-red-800" : "bg-green-900 text-green-300 hover:bg-green-800"}`}>
                    {running ? "Stop" : "Start"}
                  </button>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2">
                  <button onClick={checkStatus} className="flex-1 py-1.5 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">Refresh</button>
                  <button onClick={async () => { const o: string = await invoke("openclaw_doctor"); setDoctorOutput(o); }}
                    className="flex-1 py-1.5 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                    Diagnostics
                  </button>
                </div>
                {doctorOutput && (
                  <pre className="p-3 bg-zinc-900 rounded text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">{doctorOutput}</pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── CHANNELS ── */}
        {tab === "channels" && (
          <div className="p-4 space-y-2">
            <p className="text-xs text-zinc-500 mb-3">Connect messaging platforms to your agent.</p>
            {channels.map((ch) => {
              const setup = CHANNEL_SETUP[ch.name];
              const isExpanded = expandedChannel === ch.name;
              return (
                <div key={ch.name} className="bg-zinc-900 rounded overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <span className="text-base">{CHANNEL_ICONS[ch.name]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 capitalize">{ch.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{ch.description}</p>
                    </div>
                    <Badge ok={ch.connected} />
                    <button onClick={() => toggleChannel(ch)}
                      className={`ml-2 px-2.5 py-1 rounded text-xs ${ch.connected ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-orange-500 text-white hover:bg-orange-600"}`}>
                      {ch.connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>

                  {isExpanded && setup && (
                    <div className="px-3 pb-3 border-t border-zinc-800 pt-3 space-y-2">
                      {setup.note && <p className="text-xs text-zinc-500">{setup.note}</p>}
                      {setup.url && (
                        <a href={setup.url} target="_blank" rel="noreferrer"
                          className="text-xs text-orange-400 hover:underline block">
                          {setup.url} ↗
                        </a>
                      )}
                      {ch.name !== "imessage" && (
                        <>
                          <input
                            type="password"
                            placeholder={setup.placeholder}
                            value={channelTokens[ch.name] ?? ""}
                            onChange={(e) => setChannelTokens({ ...channelTokens, [ch.name]: e.target.value })}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                          />
                          <button onClick={() => connectChannel(ch.name)}
                            className="w-full py-1.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600">
                            Connect
                          </button>
                        </>
                      )}
                      {channelMsg[ch.name] && <p className="text-xs text-zinc-400">{channelMsg[ch.name]}</p>}
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={loadChannels} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">Refresh</button>
          </div>
        )}

        {/* ── LOGS ── */}
        {tab === "logs" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
              <Dot ok={streaming} pulse />
              <span className="text-xs text-zinc-500">{streaming ? "streaming" : "idle"}</span>
              <button onClick={startStreaming} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">
                {streaming ? "Restart" : "Start streaming"}
              </button>
              <button onClick={() => setLogs([])} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-0.5 bg-zinc-950">
              {logs.length === 0 ? (
                <p className="text-xs text-zinc-600">No logs yet. Start the agent to see activity.</p>
              ) : (
                logs.map((line, i) => {
                  const isError = /error|fail|exception/i.test(line);
                  const isWarn = /warn/i.test(line);
                  return (
                    <div key={i} className={`text-xs font-mono leading-relaxed ${isError ? "text-red-400" : isWarn ? "text-yellow-400" : "text-zinc-400"}`}>
                      {line}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* ── CONFIG ── */}
        {tab === "config" && (
          <div className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">AI Provider</label>
                <select value={provider} onChange={(e) => updateConfigField(["llm", "provider"], e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                  <option value="anthropic">Anthropic — Claude models</option>
                  <option value="openai">OpenAI — GPT models</option>
                  <option value="ollama">Ollama — local, free</option>
                  <option value="vllm">vLLM — self-hosted</option>
                </select>
              </div>

              {(provider === "anthropic" || provider === "openai") && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">API Key</label>
                  <input type="password" value={apiKey}
                    onChange={(e) => updateConfigField(["llm", "api_key"], e.target.value)}
                    placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600" />
                </div>
              )}

              {provider === "vllm" && (
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">Server URL</label>
                  <div className="flex gap-2">
                    <input type="text" value={vllmBaseUrl} onChange={(e) => setVllmBaseUrl(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500" />
                    <button onClick={checkVllm} disabled={vllmChecking}
                      className="px-3 py-1 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50">
                      {vllmChecking ? "..." : "Check"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Dot ok={vllmRunning} />
                    <span className="text-xs text-zinc-500">{vllmRunning ? `${vllmModels.length} model(s) found` : "not connected"}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Model</label>
                {provider === "ollama" ? (
                  <select value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                    {ollamaModels.length === 0 && <option value="">No models — pull one below</option>}
                    {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : provider === "vllm" ? (
                  <select value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                    {vllmModels.length === 0 && <option value="">Check server first</option>}
                    {vllmModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input type="text" value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600" />
                )}
              </div>
            </div>

            {provider === "ollama" && (
              <div className="p-3 bg-zinc-900 rounded space-y-3">
                <div className="flex items-center gap-2">
                  <Dot ok={ollamaOk} />
                  <span className="text-xs text-zinc-400">{ollamaOk ? `Ollama · ${ollamaModels.length} model(s)` : "Ollama not installed"}</span>
                  {!ollamaOk && (
                    <button onClick={() => invoke("install_ollama")} className="ml-auto text-xs text-orange-400 hover:underline">Install →</button>
                  )}
                </div>
                {ollamaOk && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <select value={pullTarget} onChange={(e) => setPullTarget(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs">
                        {POPULAR_OLLAMA_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <button onClick={pullModel} disabled={pulling}
                        className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
                        {pulling ? "Pulling..." : "Pull"}
                      </button>
                    </div>
                    {pullMsg && <p className="text-xs text-zinc-400 truncate">{pullMsg}</p>}
                  </div>
                )}
              </div>
            )}

            {provider === "vllm" && (
              <div className="p-3 bg-zinc-900 rounded text-xs text-zinc-500 space-y-1">
                <code className="block bg-zinc-800 px-2 py-1 rounded">pip install vllm</code>
                <code className="block bg-zinc-800 px-2 py-1 rounded">vllm serve &lt;model&gt;</code>
              </div>
            )}

            <button onClick={saveConfig} className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 font-medium">
              Save and continue →
            </button>
            {saveMsg && <p className="text-xs text-zinc-400">{saveMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
