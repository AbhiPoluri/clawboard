import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { AnalyticsTab } from "./components/AnalyticsTab";

type Tab = "status" | "channels" | "logs" | "config" | "persona" | "history" | "analytics";
type Provider = "anthropic" | "openai" | "ollama" | "vllm";
type Step = "check" | "install_node" | "install_openclaw" | "config" | "ready";
type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface Config {
  llm?: {
    provider?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  };
  [key: string]: unknown;
}

interface ChannelStatus {
  name: string;
  connected: boolean;
  description: string;
}

interface HistoryEntry {
  timestamp: string;
  channel: string;
  user_message: string;
  agent_response: string;
  user_name?: string;
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
  const [settingsMsg, setSettingsMsg] = useState("");
  const [exportMsg, setExportMsg] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);

  // Channels
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [channelTokens, setChannelTokens] = useState<Record<string, string>>({});
  const [channelMsg, setChannelMsg] = useState<Record<string, string>>({});
  const [channelTesting, setChannelTesting] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<"all" | "error" | "warn" | "info">("all");

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

  // Model parameters
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [topP, setTopP] = useState(0.9);

  // Persona
  const [personaName, setPersonaName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tone, setTone] = useState("Professional");
  const [responseLength, setResponseLength] = useState("Medium");
  const [personaMsg, setPersonaMsg] = useState("");

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Command palette
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // Agent uptime
  const [agentStartTime, setAgentStartTime] = useState<number | null>(null);
  const [uptime, setUptime] = useState("");

  function showToast(message: string, type: ToastType = "info") {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  // Track agent start time
  useEffect(() => {
    if (running && agentStartTime === null) {
      setAgentStartTime(Date.now());
    } else if (!running) {
      setAgentStartTime(null);
      setUptime("");
    }
  }, [running]);

  // Uptime ticker
  useEffect(() => {
    if (!agentStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - agentStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setUptime(m > 0 ? `${m}m ${s}s` : `${s}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [agentStartTime]);

  useEffect(() => { runChecks(); }, []);

  // Auto-scroll logs
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
        return;
      }
      if (!e.metaKey) return;
      if (e.key === "1") { e.preventDefault(); setTab("status"); }
      else if (e.key === "2") { e.preventDefault(); setTab("channels"); }
      else if (e.key === "3") { e.preventDefault(); setTab("logs"); startStreaming(); }
      else if (e.key === "4") { e.preventDefault(); setTab("config"); }
      else if (e.key === "5") { e.preventDefault(); setTab("persona"); loadPersona(); }
      else if (e.key === "6") { e.preventDefault(); setTab("history"); loadHistory(); }
      else if (e.key === "7") { e.preventDefault(); setTab("analytics"); loadHistory(); }
      else if (e.key === "l" || e.key === "L") { e.preventDefault(); setTab("logs"); startStreaming(); }
      else if (e.key === ",") { e.preventDefault(); setTab("config"); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [streaming]);

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
      if (parsed.llm?.temperature !== undefined) setTemperature(parsed.llm.temperature);
      if (parsed.llm?.max_tokens !== undefined) setMaxTokens(parsed.llm.max_tokens);
      if (parsed.llm?.top_p !== undefined) setTopP(parsed.llm.top_p);
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
      showToast("Config saved", "success");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg(`Error: ${e}`);
      showToast(`Save failed: ${e}`, "error");
    }
  }

  async function exportSettings() {
    try {
      setExportMsg("");
      const json: string = await invoke("export_settings");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clawboard-settings.json";
      a.click();
      URL.revokeObjectURL(url);
      setSettingsMsg("Settings exported.");
    } catch (e) {
      setSettingsMsg(`Export failed: ${e}`);
    }
    setTimeout(() => setSettingsMsg(""), 3000);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text); // validate JSON
      await invoke("import_settings", { data: text });
      setSettingsMsg("Settings imported.");
      await loadConfig();
    } catch (e) {
      setSettingsMsg(`Import failed: ${e}`);
    }
    setTimeout(() => setSettingsMsg(""), 3000);
    e.target.value = "";
  }

  function updateLlmParam(key: string, value: number) {
    try {
      const parsed: Config = JSON.parse(configText);
      parsed.llm = { ...parsed.llm, [key]: value };
      const updated = JSON.stringify(parsed, null, 2);
      setConfigText(updated);
      setConfig(parsed);
    } catch { /* ignore */ }
  }

  function resetModelParams() {
    setTemperature(0.7);
    setMaxTokens(2048);
    setTopP(0.9);
    try {
      const parsed: Config = JSON.parse(configText);
      parsed.llm = { ...parsed.llm, temperature: 0.7, max_tokens: 2048, top_p: 0.9 };
      const updated = JSON.stringify(parsed, null, 2);
      setConfigText(updated);
      setConfig(parsed);
    } catch { /* ignore */ }
  }

  async function loadPersona() {
    try {
      const raw: string = await invoke("read_persona");
      const parsed = JSON.parse(raw);
      if (parsed.name) setPersonaName(parsed.name);
      if (parsed.system_prompt) setSystemPrompt(parsed.system_prompt);
      if (parsed.tone) setTone(parsed.tone);
      if (parsed.response_length) setResponseLength(parsed.response_length);
    } catch { /* start fresh */ }
  }

  async function savePersona() {
    try {
      const payload = JSON.stringify({ name: personaName, system_prompt: systemPrompt, tone, response_length: responseLength }, null, 2);
      await invoke("write_persona", { persona: payload });
      setPersonaMsg("Saved.");
      setTimeout(() => setPersonaMsg(""), 2000);
    } catch (e) { setPersonaMsg(`Error: ${e}`); }
  }

  function resetPersona() {
    setPersonaName("");
    setSystemPrompt("");
    setTone("Professional");
    setResponseLength("Medium");
    setPersonaMsg("");
  }

  async function loadHistory() {
    try {
      const raw: string = await invoke("read_history");
      const parsed: HistoryEntry[] = JSON.parse(raw);
      setHistory(parsed.slice().reverse());
    } catch { setHistory([]); }
  }

  async function startAgent() {
    try {
      await invoke("openclaw_start");
      showToast("Agent started", "success");
    } catch (e) { showToast(`Error: ${e}`, "error"); }
    setTimeout(checkStatus, 800);
  }

  async function stopAgent() {
    try {
      await invoke("openclaw_stop");
      showToast("Agent stopped", "info");
    } catch (e) { showToast(`Error: ${e}`, "error"); }
    setTimeout(checkStatus, 800);
  }

  async function runDiagnostics() {
    const o: string = await invoke("openclaw_doctor");
    setDoctorOutput(o);
    setTab("status");
    showToast("Diagnostics complete", "info");
  }

  async function exportLogs() {
    try {
      await invoke("save_logs", { content: logs.join("\n") });
      showToast("Logs exported", "success");
    } catch (e) {
      if (String(e) !== "Cancelled") showToast(`Export failed: ${e}`, "error");
    }
  }

  async function clearHistoryData() {
    try {
      await invoke("clear_history");
      setHistory([]);
      setClearConfirm(false);
    } catch { /* ignore */ }
  }

  async function loadChannels() {
    const ch: ChannelStatus[] = await invoke("get_channel_statuses");
    setChannels(ch);
  }

  async function toggleChannel(ch: ChannelStatus) {
    if (ch.connected) {
      try {
        await invoke("disable_channel", { channel: ch.name });
        showToast(`${ch.name} disabled`, "info");
      } catch (e) {
        showToast(`Failed to disable ${ch.name}: ${e}`, "error");
        return;
      }
    } else {
      if (ch.name === "imessage") {
        try {
          await invoke("enable_channel", { channel: ch.name, token: "" });
          showToast("iMessage enabled", "success");
        } catch (e) {
          showToast(`Failed to enable iMessage: ${e}`, "error");
          return;
        }
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
      showToast(`${name} connected`, "success");
      await loadChannels();
    } catch (e) {
      setChannelMsg({ ...channelMsg, [name]: `Error: ${e}` });
      showToast(`Failed to connect ${name}: ${e}`, "error");
    }
    setTimeout(() => setChannelMsg((m) => ({ ...m, [name]: "" })), 3000);
  }

  async function testChannel(name: string) {
    setChannelTesting((prev) => ({ ...prev, [name]: "testing" }));
    try {
      const ok: boolean = await invoke("test_channel", { channel: name });
      setChannelTesting((prev) => ({ ...prev, [name]: ok ? "ok" : "fail" }));
      showToast(ok ? `${name} — connection OK` : `${name} — connection failed`, ok ? "success" : "error");
    } catch (e) {
      setChannelTesting((prev) => ({ ...prev, [name]: "fail" }));
      showToast(`${name} test error: ${e}`, "error");
    }
    setTimeout(() => setChannelTesting((prev) => ({ ...prev, [name]: "idle" })), 3000);
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
      showToast("OpenClaw installed", "success");
    } catch (e) {
      setInstallMsg(`Failed: ${e}`);
      showToast(`Install failed: ${e}`, "error");
    }
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
      showToast(`${pullTarget} pulled`, "success");
    } catch (e) {
      setPullMsg(`Error: ${e}`);
      showToast(`Pull failed: ${e}`, "error");
    }
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

  const tabs: { id: Tab; label: string; shortcut: string }[] = [
    { id: "status", label: "Status", shortcut: "⌘1" },
    { id: "channels", label: "Channels", shortcut: "⌘2" },
    { id: "logs", label: "Logs", shortcut: "⌘3" },
    { id: "config", label: "Config", shortcut: "⌘4" },
    { id: "persona", label: "Persona", shortcut: "⌘5" },
    { id: "history", label: "History", shortcut: "⌘6" },
    { id: "analytics", label: "Analytics", shortcut: "⌘7" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono text-sm flex flex-col select-none">
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-3 py-2 rounded text-xs font-mono shadow-lg border pointer-events-auto
              ${t.type === "success" ? "bg-green-950 text-green-300 border-green-800"
              : t.type === "error" ? "bg-red-950 text-red-300 border-red-800"
              : "bg-blue-950 text-blue-300 border-blue-800"}`}
          >
            {t.message}
          </div>
        ))}
      </div>

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
        {tabs.map(({ id, label, shortcut }) => (
          <button key={id} onClick={() => {
            setTab(id);
            if (id === "logs") startStreaming();
            if (id === "persona") loadPersona();
            if (id === "history") loadHistory();
            if (id === "analytics") loadHistory();
          }}
            className={`flex-1 py-2 text-xs transition-colors group relative ${tab === id ? "text-orange-400 border-b-2 border-orange-500" : "text-zinc-500 hover:text-zinc-300"}`}>
            {label}
            <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-1.5 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded whitespace-nowrap pointer-events-none">
              {shortcut}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">

        {/* STATUS */}
        {tab === "status" && (
          <ErrorBoundary label="Status">
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

                {/* Agent toggle with uptime */}
                <div className="p-3 bg-zinc-900 rounded flex items-center gap-3">
                  <Dot ok={running} pulse />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-zinc-300">Agent {running ? "running" : "stopped"}</span>
                    {running && uptime && (
                      <span className="ml-2 text-xs text-zinc-500">{uptime}</span>
                    )}
                  </div>
                  <button onClick={async () => {
                    try {
                      if (running) {
                        await invoke("openclaw_stop");
                        showToast("Agent stopped", "info");
                      } else {
                        await invoke("openclaw_start");
                        showToast("Agent started", "success");
                      }
                    } catch (e) {
                      showToast(`Error: ${e}`, "error");
                    }
                    setTimeout(checkStatus, 800);
                  }}
                    className={`px-4 py-1.5 rounded text-xs font-medium ${running ? "bg-red-900 text-red-300 hover:bg-red-800" : "bg-green-900 text-green-300 hover:bg-green-800"}`}>
                    {running ? "Stop" : "Start"}
                  </button>
                </div>

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
          </ErrorBoundary>
        )}

        {/* CHANNELS */}
        {tab === "channels" && (
          <ErrorBoundary label="Channels">
          <div className="p-4 space-y-2">
            <p className="text-xs text-zinc-500 mb-3">Connect messaging platforms to your agent.</p>
            {channels.map((ch) => {
              const setup = CHANNEL_SETUP[ch.name];
              const isExpanded = expandedChannel === ch.name;
              const testState = channelTesting[ch.name] ?? "idle";
              return (
                <div key={ch.name} className="bg-zinc-900 rounded overflow-hidden">
                  <div className="flex items-center gap-3 p-3">
                    <span className="text-base">{CHANNEL_ICONS[ch.name]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 capitalize">{ch.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{ch.description}</p>
                    </div>
                    <Badge ok={ch.connected} />
                    {/* Test button */}
                    <button
                      onClick={() => testChannel(ch.name)}
                      disabled={testState === "testing"}
                      title="Test connection"
                      className="ml-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 w-10 text-center"
                    >
                      {testState === "testing" ? (
                        <span className="inline-block animate-spin">⟳</span>
                      ) : testState === "ok" ? (
                        <span className="text-green-400">✓</span>
                      ) : testState === "fail" ? (
                        <span className="text-red-400">✗</span>
                      ) : (
                        "Test"
                      )}
                    </button>
                    <button onClick={() => toggleChannel(ch)}
                      className={`ml-1 px-2.5 py-1 rounded text-xs ${ch.connected ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-orange-500 text-white hover:bg-orange-600"}`}>
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
          </ErrorBoundary>
        )}

        {/* LOGS */}
        {tab === "logs" && (<ErrorBoundary label="Logs">{(() => {
          const filtered = logs.filter((line) => {
            const isError = /error|fail|exception/i.test(line);
            const isWarn = /warn/i.test(line);
            const matchesSeverity =
              logFilter === "all" ||
              (logFilter === "error" && isError) ||
              (logFilter === "warn" && isWarn && !isError) ||
              (logFilter === "info" && !isError && !isWarn);
            const matchesSearch = logSearch === "" || line.toLowerCase().includes(logSearch.toLowerCase());
            return matchesSeverity && matchesSearch;
          });

          return (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
                <Dot ok={streaming} pulse />
                <span className="text-xs text-zinc-500">{streaming ? "streaming" : "idle"}</span>
                <button onClick={startStreaming} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">
                  {streaming ? "Restart" : "Start streaming"}
                </button>
                <button onClick={() => setLogs([])} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
              </div>

              {/* Search + filter bar */}
              <div className="flex flex-col gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search logs..."
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-xs text-zinc-500 whitespace-nowrap">{filtered.length}/{logs.length} lines</span>
                  <button
                    onClick={async () => {
                      try {
                        setExportMsg("");
                        await invoke("save_logs", { content: filtered.join("\n") });
                        setExportMsg("Saved.");
                      } catch (e) {
                        if (String(e) !== "Cancelled") setExportMsg(`Error: ${e}`);
                      }
                      setTimeout(() => setExportMsg(""), 3000);
                    }}
                    className="px-3 py-1.5 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border border-zinc-600 whitespace-nowrap"
                  >
                    Export
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["all", "error", "warn", "info"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2.5 py-0.5 rounded text-xs capitalize transition-colors ${
                        logFilter === f
                          ? f === "error" ? "bg-red-900 text-red-300 border border-red-700"
                            : f === "warn" ? "bg-yellow-900 text-yellow-300 border border-yellow-700"
                            : "bg-blue-900 text-blue-300 border border-blue-700"
                          : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300"
                      }`}
                    >
                      {f === "all" ? "All" : f === "error" ? "Errors" : f === "warn" ? "Warnings" : "Info"}
                    </button>
                  ))}
                  {exportMsg && <span className="ml-auto text-xs text-zinc-400">{exportMsg}</span>}
                </div>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-0.5 bg-zinc-950">
                {filtered.length === 0 ? (
                  <p className="text-xs text-zinc-600">
                    {logs.length === 0 ? "No logs yet. Start the agent to see activity." : "No lines match the current filter."}
                  </p>
                ) : (
                  filtered.map((line, i) => {
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
          );
        })()}</ErrorBoundary>}

        {/* CONFIG */}
        {tab === "config" && (
          <ErrorBoundary label="Config">
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

            {/* Model Parameters */}
            <div className="p-3 bg-zinc-900 rounded space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Model Parameters</label>
                <button onClick={resetModelParams} className="text-xs text-emerald-500 hover:text-emerald-400">
                  Reset defaults
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400">Temperature</label>
                  <span className="text-xs text-zinc-300 font-mono tabular-nums">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range" min="0" max="2" step="0.1" value={temperature}
                  onChange={(e) => { const v = parseFloat(e.target.value); setTemperature(v); updateLlmParam("temperature", v); }}
                  className="w-full h-1.5 rounded appearance-none bg-zinc-700 accent-emerald-500 cursor-pointer"
                />
                <p className="text-xs text-zinc-600">Controls randomness. Lower = more focused, higher = more creative</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400">Max Tokens</label>
                  <span className="text-xs text-zinc-300 font-mono tabular-nums">{maxTokens}</span>
                </div>
                <input
                  type="range" min="100" max="8192" step="100" value={maxTokens}
                  onChange={(e) => { const v = parseInt(e.target.value); setMaxTokens(v); updateLlmParam("max_tokens", v); }}
                  className="w-full h-1.5 rounded appearance-none bg-zinc-700 accent-emerald-500 cursor-pointer"
                />
                <p className="text-xs text-zinc-600">Maximum length of each response</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-400">Top-P</label>
                  <span className="text-xs text-zinc-300 font-mono tabular-nums">{topP.toFixed(2)}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.05" value={topP}
                  onChange={(e) => { const v = parseFloat(e.target.value); setTopP(v); updateLlmParam("top_p", v); }}
                  className="w-full h-1.5 rounded appearance-none bg-zinc-700 accent-emerald-500 cursor-pointer"
                />
                <p className="text-xs text-zinc-600">Nucleus sampling threshold. Lower = more focused vocabulary</p>
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

            {/* Import / Export */}
            <div className="pt-2 border-t border-zinc-800 space-y-3">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Import / Export</label>
              <div className="flex gap-2">
                <button
                  onClick={exportSettings}
                  className="flex-1 py-2 rounded text-xs bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                >
                  Export Settings
                </button>
                <button
                  onClick={() => importFileRef.current?.click()}
                  className="flex-1 py-2 rounded text-xs bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
                >
                  Import Settings
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </div>
              <p className="text-xs text-amber-600">Importing settings will overwrite your current configuration.</p>
              {settingsMsg && <p className="text-xs text-zinc-400">{settingsMsg}</p>}
            </div>
          </div>
          </ErrorBoundary>
        )}

        {/* PERSONA */}
        {tab === "persona" && (
          <ErrorBoundary label="Persona">
          <div className="p-4 space-y-4">
            <p className="text-xs text-zinc-500">Define your agent's personality and communication style.</p>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">Persona Name</label>
              <input
                type="text"
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value)}
                placeholder="e.g. Friendly Assistant"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">System Prompt</label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                rows={6}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500 placeholder:text-zinc-600 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option>Professional</option>
                  <option>Casual</option>
                  <option>Friendly</option>
                  <option>Technical</option>
                  <option>Concise</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Response Length</label>
                <select
                  value={responseLength}
                  onChange={(e) => setResponseLength(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option>Brief</option>
                  <option>Medium</option>
                  <option>Detailed</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={savePersona}
                className="flex-1 py-2.5 rounded text-xs bg-emerald-600 text-white hover:bg-emerald-500 font-medium"
              >
                Save Persona
              </button>
              <button
                onClick={resetPersona}
                className="px-4 py-2.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              >
                Reset to Default
              </button>
            </div>
            {personaMsg && <p className="text-xs text-zinc-400">{personaMsg}</p>}
          </div>
          </ErrorBoundary>
        )}

        {/* ANALYTICS */}
        {tab === "analytics" && <ErrorBoundary label="Analytics"><AnalyticsTab history={history} /></ErrorBoundary>}

        {/* HISTORY */}
        {tab === "history" && (<ErrorBoundary label="History">{(() => {
          const CHANNEL_BADGES: Record<string, string> = {
            imessage: "bg-blue-900 text-blue-300",
            whatsapp: "bg-green-900 text-green-300",
            telegram: "bg-blue-800 text-blue-400",
            discord: "bg-indigo-900 text-indigo-300",
            slack: "bg-purple-900 text-purple-300",
          };

          function fmtTime(ts: string) {
            try {
              const d = new Date(ts);
              return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
            } catch { return ts; }
          }

          return (
            <div className="flex flex-col h-full">
              {/* Top bar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
                <span className="text-xs text-zinc-400">{history.length} conversation{history.length !== 1 ? "s" : ""}</span>
                <button onClick={loadHistory} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">Refresh</button>
                {!clearConfirm ? (
                  <button
                    onClick={() => setClearConfirm(true)}
                    className="text-xs text-red-500 hover:text-red-400"
                  >
                    Clear History
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">Sure?</span>
                    <button onClick={clearHistoryData} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes, delete</button>
                    <button onClick={() => setClearConfirm(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                  </div>
                )}
              </div>

              {/* List */}
              <div className="flex-1 overflow-auto p-4 space-y-2">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-3 text-zinc-600">
                    <span className="text-3xl">💬</span>
                    <p className="text-xs">No conversation history yet</p>
                  </div>
                ) : (
                  history.map((entry, i) => {
                    const isExpanded = expandedHistory === i;
                    const badgeClass = CHANNEL_BADGES[entry.channel] ?? "bg-zinc-800 text-zinc-400";
                    return (
                      <div
                        key={i}
                        className="bg-zinc-900 rounded overflow-hidden cursor-pointer hover:bg-zinc-800 transition-colors"
                        onClick={() => setExpandedHistory(isExpanded ? null : i)}
                      >
                        <div className="flex items-start gap-2 p-3">
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${badgeClass}`}>
                            {entry.channel}
                          </span>
                          <div className="flex-1 min-w-0">
                            {entry.user_name && (
                              <p className="text-xs text-zinc-400 mb-0.5">{entry.user_name}</p>
                            )}
                            <p className="text-xs text-zinc-200 truncate">
                              {isExpanded ? entry.user_message : entry.user_message.slice(0, 80) + (entry.user_message.length > 80 ? "…" : "")}
                            </p>
                            {!isExpanded && (
                              <p className="text-xs text-zinc-500 truncate mt-0.5">
                                ↳ {entry.agent_response.slice(0, 80)}{entry.agent_response.length > 80 ? "…" : ""}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-zinc-600 flex-shrink-0 whitespace-nowrap">{fmtTime(entry.timestamp)}</span>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-zinc-800 px-3 pb-3 pt-2 space-y-3">
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">User</p>
                              <p className="text-xs text-zinc-200 whitespace-pre-wrap">{entry.user_message}</p>
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 mb-1">Agent</p>
                              <p className="text-xs text-zinc-300 whitespace-pre-wrap">{entry.agent_response}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}</ErrorBoundary>}

      </div>

      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onNavigate={(t) => {
          setTab(t);
          if (t === "logs") startStreaming();
          if (t === "persona") loadPersona();
          if (t === "history") loadHistory();
        }}
        onStartAgent={startAgent}
        onStopAgent={stopAgent}
        onRunDiagnostics={runDiagnostics}
        onExportSettings={exportSettings}
        onImportSettings={() => importFileRef.current?.click()}
        onStartLogStreaming={() => { setTab("logs"); startStreaming(); }}
        onStopLogStreaming={() => setStreaming(false)}
        onExportLogs={exportLogs}
      />
    </div>
  );
}
