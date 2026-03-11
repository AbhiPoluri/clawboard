import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./index.css";

type Tab = "status" | "config";
type Provider = "anthropic" | "openai" | "ollama" | "vllm";
type Step = "check" | "install_node" | "install_openclaw" | "config" | "ready";

interface Config {
  llm?: { provider?: string; api_key?: string; model?: string; base_url?: string };
  [key: string]: unknown;
}

const POPULAR_OLLAMA_MODELS = [
  "llama3.2", "llama3.1", "mistral", "phi4", "gemma3", "qwen2.5", "deepseek-r1"
];

function StatusDot({ ok, pulse }: { ok: boolean; pulse?: boolean }) {
  return <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : "bg-zinc-600"} ${pulse && ok ? "animate-pulse" : ""}`} />;
}

function App() {
  const [tab, setTab] = useState<Tab>("status");

  // Onboarding state
  const [nodeOk, setNodeOk] = useState<boolean | null>(null);
  const [clawOk, setClawOk] = useState<boolean | null>(null);
  const [configOk, setConfigOk] = useState(false);
  const [step, setStep] = useState<Step>("check");
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");

  // Runtime state
  const [running, setRunning] = useState(false);
  const [doctorOutput, setDoctorOutput] = useState("");

  // Config state
  const [configText, setConfigText] = useState("{}");
  const [config, setConfig] = useState<Config>({});
  const [saveMsg, setSaveMsg] = useState("");

  // Ollama
  const [ollamaOk, setOllamaOk] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [pulling, setPulling] = useState(false);
  const [pullTarget, setPullTarget] = useState("llama3.2");
  const [pullMsg, setPullMsg] = useState("");

  // vLLM
  const [vllmBaseUrl, setVllmBaseUrl] = useState("http://localhost:8000");
  const [vllmRunning, setVllmRunning] = useState(false);
  const [vllmModels, setVllmModels] = useState<string[]>([]);
  const [vllmChecking, setVllmChecking] = useState(false);

  useEffect(() => { runChecks(); }, []);

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

    // Check if config has a provider set
    const raw: string = await invoke("read_config");
    try {
      const parsed = JSON.parse(raw);
      if (parsed.llm?.provider) { setConfigOk(true); setStep("ready"); }
      else setStep("config");
    } catch { setStep("config"); }
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
    } catch { /* ignore */ }
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

  async function installOpenclaw() {
    setInstalling(true);
    setInstallMsg("Installing openclaw via npm...");
    try {
      const msg: string = await invoke("install_openclaw");
      setInstallMsg(msg);
      setClawOk(true);
      setStep("config");
    } catch (e) {
      setInstallMsg(`Failed: ${e}`);
    }
    setInstalling(false);
  }

  async function installOllama() {
    const msg: string = await invoke("install_ollama");
    setInstallMsg(msg);
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
    setOllamaOk(ok);
    if (ok) {
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
    }
  }

  async function pullModel() {
    setPulling(true);
    setPullMsg("Pulling... may take a minute.");
    try {
      await invoke("ollama_pull", { model: pullTarget });
      setPullMsg(`Done! ${pullTarget} ready.`);
      const models: string[] = await invoke("ollama_list_models");
      setOllamaModels(models);
      updateConfigFields({ llm: { provider: "ollama", model: pullTarget, api_key: "" } });
    } catch (e) { setPullMsg(`Error: ${e}`); }
    setPulling(false);
    setTimeout(() => setPullMsg(""), 4000);
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

  const apiKey = config.llm?.api_key ?? "";
  const provider = (config.llm?.provider ?? "anthropic") as Provider;
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono text-sm flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800">
        <span className="text-lg">🦞</span>
        <span className="font-semibold text-zinc-200 tracking-tight">Clawboard</span>
        <div className="ml-auto flex gap-1">
          {(["status", "config"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1 rounded text-xs capitalize transition-colors ${tab === t ? "bg-orange-500 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-5 py-4 overflow-auto">

        {/* ── STATUS TAB ── */}
        {tab === "status" && (
          <div className="space-y-4">

            {/* Step: install node */}
            {step === "install_node" && (
              <div className="p-4 bg-zinc-900 rounded space-y-3">
                <p className="text-zinc-200 font-semibold">Node.js required</p>
                <p className="text-xs text-zinc-400">OpenClaw is installed via npm. Install Node.js first.</p>
                <button onClick={() => invoke("install_ollama").then(() => window.open("https://nodejs.org/en/download"))}
                  className="px-4 py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 w-full">
                  Open nodejs.org to install Node.js
                </button>
                <button onClick={runChecks} className="px-4 py-2 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 w-full">
                  I installed it — check again
                </button>
              </div>
            )}

            {/* Step: install openclaw */}
            {step === "install_openclaw" && (
              <div className="p-4 bg-zinc-900 rounded space-y-3">
                <p className="text-zinc-200 font-semibold">Install OpenClaw</p>
                <p className="text-xs text-zinc-400">OpenClaw is not installed. Install it now — no terminal needed.</p>
                <button onClick={installOpenclaw} disabled={installing}
                  className="px-4 py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 w-full disabled:opacity-50">
                  {installing ? "Installing..." : "Install OpenClaw"}
                </button>
                {installMsg && <p className="text-xs text-zinc-400">{installMsg}</p>}
              </div>
            )}

            {/* Step: needs config */}
            {step === "config" && (
              <div className="p-4 bg-zinc-900 rounded space-y-2">
                <p className="text-zinc-200 font-semibold">Almost there</p>
                <p className="text-xs text-zinc-400">Choose an AI provider to finish setup.</p>
                <button onClick={() => setTab("config")}
                  className="px-4 py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 w-full">
                  Set up AI provider →
                </button>
              </div>
            )}

            {/* Ready state */}
            {step === "ready" && (
              <>
                {/* Checklist */}
                <div className="space-y-2">
                  {[
                    { label: "Node.js", ok: !!nodeOk },
                    { label: "OpenClaw", ok: !!clawOk },
                    { label: "AI provider configured", ok: configOk },
                  ].map(({ label, ok }) => (
                    <div key={label} className="flex items-center gap-3">
                      <StatusDot ok={ok} />
                      <span className={`text-xs ${ok ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span>
                      {ok && <span className="text-xs text-green-500 ml-auto">✓</span>}
                    </div>
                  ))}
                </div>

                {/* Agent control */}
                <div className="flex items-center gap-3 pt-2">
                  <StatusDot ok={running} pulse />
                  <span className="text-zinc-300 text-xs">Agent {running ? "running" : "stopped"}</span>
                  <button onClick={toggleAgent}
                    className={`ml-auto px-4 py-1.5 rounded text-xs font-medium ${running ? "bg-red-900 text-red-300 hover:bg-red-800" : "bg-green-900 text-green-300 hover:bg-green-800"}`}>
                    {running ? "Stop agent" : "Start agent"}
                  </button>
                </div>
                <button onClick={checkStatus} className="text-xs text-zinc-500 hover:text-zinc-300">Refresh status</button>

                {/* Doctor */}
                <div className="pt-1">
                  <button onClick={runDoctor} className="px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                    Run diagnostics
                  </button>
                  {doctorOutput && <pre className="mt-2 p-3 bg-zinc-900 rounded text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">{doctorOutput}</pre>}
                </div>
              </>
            )}

            {/* Checking state */}
            {step === "check" && (
              <p className="text-xs text-zinc-500 animate-pulse">Checking your setup...</p>
            )}
          </div>
        )}

        {/* ── CONFIG TAB ── */}
        {tab === "config" && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">AI Provider</label>
                <select value={provider} onChange={(e) => updateConfigField(["llm", "provider"], e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                  <option value="anthropic">Anthropic (Claude) — needs API key</option>
                  <option value="openai">OpenAI — needs API key</option>
                  <option value="ollama">Ollama — local, free, no key</option>
                  <option value="vllm">vLLM — self-hosted server</option>
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
                      placeholder="http://localhost:8000"
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500" />
                    <button onClick={checkVllm} disabled={vllmChecking}
                      className="px-3 py-1 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50">
                      {vllmChecking ? "..." : "Check"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusDot ok={vllmRunning} />
                    <span className="text-xs text-zinc-500">{vllmRunning ? `connected · ${vllmModels.length} model(s)` : "not connected"}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wider">Model</label>
                {provider === "ollama" ? (
                  <select value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                    {ollamaModels.length === 0 && <option value="">No local models — pull one below</option>}
                    {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : provider === "vllm" ? (
                  <select value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500">
                    {vllmModels.length === 0 && <option value="">Connect to server first</option>}
                    {vllmModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <input type="text" value={model} onChange={(e) => updateConfigField(["llm", "model"], e.target.value)}
                    placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600" />
                )}
              </div>
            </div>

            {/* Ollama section */}
            {provider === "ollama" && (
              <div className="p-3 bg-zinc-900 rounded space-y-3">
                <div className="flex items-center gap-2">
                  <StatusDot ok={ollamaOk} />
                  <span className="text-xs text-zinc-400">
                    Ollama {ollamaOk ? `installed · ${ollamaModels.length} model(s)` : "not installed"}
                  </span>
                  {!ollamaOk && (
                    <button onClick={installOllama} className="ml-auto text-xs text-orange-400 hover:underline">
                      Install Ollama →
                    </button>
                  )}
                </div>
                {ollamaOk && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">Pull a model (downloads it locally)</p>
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
                    {pullMsg && <p className="text-xs text-zinc-400">{pullMsg}</p>}
                  </div>
                )}
              </div>
            )}

            {/* vLLM quick start */}
            {provider === "vllm" && (
              <div className="p-3 bg-zinc-900 rounded text-xs text-zinc-500 space-y-1">
                <p className="text-zinc-300">Start a vLLM server</p>
                <code className="block bg-zinc-800 px-2 py-1 rounded">pip install vllm</code>
                <code className="block bg-zinc-800 px-2 py-1 rounded">vllm serve &lt;model-name&gt;</code>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button onClick={saveConfig} className="flex-1 py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 font-medium">
                Save and continue →
              </button>
            </div>
            {saveMsg && <p className="text-xs text-zinc-400">{saveMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
