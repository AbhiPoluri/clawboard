import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./index.css";

import { Tab, Step, Config, ChannelStatus, Provider, LogFilter } from "./types";
import { Dot } from "./components/Dot";
import { TabBar } from "./components/TabBar";
import { StatusTab } from "./components/StatusTab";
import { ChannelsTab } from "./components/ChannelsTab";
import { LogsTab } from "./components/LogsTab";
import { ConfigTab } from "./components/ConfigTab";
import { PersonaTab } from "./components/PersonaTab";

const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "channels", label: "Channels" },
  { id: "config", label: "Config" },
  { id: "persona", label: "Persona" },
  { id: "logs", label: "Logs" },
];

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
  const importFileRef = useRef<HTMLInputElement>(null);

  // Channels
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [channelTokens, setChannelTokens] = useState<Record<string, string>>({});
  const [channelMsg, setChannelMsg] = useState<Record<string, string>>({});

  // Persona
  const [personaName, setPersonaName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tone, setTone] = useState("Professional");
  const [responseLength, setResponseLength] = useState("Medium");
  const [personaMsg, setPersonaMsg] = useState("");

  // Logs
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [exportMsg, setExportMsg] = useState("");

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
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) { setSaveMsg(`Error: ${e}`); }
  }

  async function exportSettings() {
    try {
      const json: string = await invoke("export_settings");
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clawboard-settings.json";
      a.click();
      URL.revokeObjectURL(url);
      setSettingsMsg("Exported.");
    } catch (e) {
      setSettingsMsg(`Error: ${e}`);
    }
    setTimeout(() => setSettingsMsg(""), 3000);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      try {
        await invoke("import_settings", { data: text });
        await loadConfig();
        setSettingsMsg("Settings imported.");
      } catch (err) {
        setSettingsMsg(`Import failed: ${err}`);
      }
      setTimeout(() => setSettingsMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
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
    } catch { /* use defaults */ }
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

  async function handleToggleAgent() {
    if (running) await invoke("openclaw_stop");
    else await invoke("openclaw_start");
    setTimeout(checkStatus, 800);
  }

  async function handleDiagnostics() {
    const o: string = await invoke("openclaw_doctor");
    setDoctorOutput(o);
  }

  async function handleExportLogs(content: string) {
    try {
      setExportMsg("");
      await invoke("save_logs", { content });
      setExportMsg("Saved.");
    } catch (e) {
      if (String(e) !== "Cancelled") setExportMsg(`Error: ${e}`);
    }
    setTimeout(() => setExportMsg(""), 3000);
  }

  function handleTabChange(newTab: Tab) {
    setTab(newTab);
    if (newTab === "logs") startStreaming();
    if (newTab === "persona") loadPersona();
  }

  // Suppress unused warnings for model params (no UI yet)
  void [temperature, maxTokens, topP, updateLlmParam, resetModelParams];
  void [personaName, systemPrompt, tone, responseLength, personaMsg,
        setPersonaName, setSystemPrompt, setTone, setResponseLength,
        savePersona, resetPersona];

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

      <TabBar tabs={TABS} activeTab={tab} onTabChange={handleTabChange} />

      <div className="flex-1 overflow-auto">
        {tab === "status" && (
          <StatusTab
            step={step}
            nodeOk={nodeOk}
            clawOk={clawOk}
            configOk={configOk}
            channels={channels}
            running={running}
            installing={installing}
            installMsg={installMsg}
            doctorOutput={doctorOutput}
            onRunChecks={runChecks}
            onInstallOpenclaw={installOpenclaw}
            onToggleAgent={handleToggleAgent}
            onCheckStatus={checkStatus}
            onDiagnostics={handleDiagnostics}
            onGoToConfig={() => setTab("config")}
          />
        )}
        {tab === "channels" && (
          <ChannelsTab
            channels={channels}
            expandedChannel={expandedChannel}
            channelTokens={channelTokens}
            channelMsg={channelMsg}
            onToggleChannel={toggleChannel}
            onConnectChannel={connectChannel}
            onLoadChannels={loadChannels}
            onSetChannelTokens={setChannelTokens}
          />
        )}
        {tab === "config" && (
          <ConfigTab
            config={config}
            provider={provider}
            apiKey={apiKey}
            model={model}
            saveMsg={saveMsg}
            settingsMsg={settingsMsg}
            importFileRef={importFileRef}
            ollamaOk={ollamaOk}
            ollamaModels={ollamaModels}
            pullTarget={pullTarget}
            pullMsg={pullMsg}
            pulling={pulling}
            vllmBaseUrl={vllmBaseUrl}
            vllmRunning={vllmRunning}
            vllmModels={vllmModels}
            vllmChecking={vllmChecking}
            onUpdateConfigField={updateConfigField}
            onSaveConfig={saveConfig}
            onSetPullTarget={setPullTarget}
            onPullModel={pullModel}
            onSetVllmBaseUrl={setVllmBaseUrl}
            onCheckVllm={checkVllm}
            onExportSettings={exportSettings}
            onImportFile={handleImportFile}
          />
        )}
        {tab === "persona" && <PersonaTab />}
        {tab === "logs" && (
          <LogsTab
            logs={logs}
            streaming={streaming}
            logSearch={logSearch}
            logFilter={logFilter}
            exportMsg={exportMsg}
            logsEndRef={logsEndRef}
            onStartStreaming={startStreaming}
            onClearLogs={() => setLogs([])}
            onSetLogSearch={setLogSearch}
            onSetLogFilter={setLogFilter}
            onExportLogs={handleExportLogs}
          />
        )}
      </div>
    </div>
  );
}
