import { RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Config, Provider, POPULAR_OLLAMA_MODELS } from "../types";
import { Dot } from "./Dot";

interface ConfigTabProps {
  config: Config;
  provider: Provider;
  apiKey: string;
  model: string;
  saveMsg: string;
  settingsMsg: string;
  importFileRef: RefObject<HTMLInputElement | null>;
  ollamaOk: boolean;
  ollamaModels: string[];
  pullTarget: string;
  pullMsg: string;
  pulling: boolean;
  vllmBaseUrl: string;
  vllmRunning: boolean;
  vllmModels: string[];
  vllmChecking: boolean;
  onUpdateConfigField: (path: string[], value: string) => void;
  onSaveConfig: () => void;
  onSetPullTarget: (target: string) => void;
  onPullModel: () => void;
  onSetVllmBaseUrl: (url: string) => void;
  onCheckVllm: () => void;
  onExportSettings: () => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ConfigTab({
  provider,
  apiKey,
  model,
  saveMsg,
  settingsMsg,
  importFileRef,
  ollamaOk,
  ollamaModels,
  pullTarget,
  pullMsg,
  pulling,
  vllmBaseUrl,
  vllmRunning,
  vllmModels,
  vllmChecking,
  onUpdateConfigField,
  onSaveConfig,
  onSetPullTarget,
  onPullModel,
  onSetVllmBaseUrl,
  onCheckVllm,
  onExportSettings,
  onImportFile,
}: ConfigTabProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">AI Provider</label>
          <select
            value={provider}
            onChange={(e) => onUpdateConfigField(["llm", "provider"], e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
          >
            <option value="anthropic">Anthropic — Claude models</option>
            <option value="openai">OpenAI — GPT models</option>
            <option value="ollama">Ollama — local, free</option>
            <option value="vllm">vLLM — self-hosted</option>
          </select>
        </div>

        {(provider === "anthropic" || provider === "openai") && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 uppercase tracking-wider">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onUpdateConfigField(["llm", "api_key"], e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
          </div>
        )}

        {provider === "vllm" && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 uppercase tracking-wider">Server URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={vllmBaseUrl}
                onChange={(e) => onSetVllmBaseUrl(e.target.value)}
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={onCheckVllm}
                disabled={vllmChecking}
                className="px-3 py-1 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
              >
                {vllmChecking ? "..." : "Check"}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Dot ok={vllmRunning} />
              <span className="text-xs text-zinc-500">
                {vllmRunning ? `${vllmModels.length} model(s) found` : "not connected"}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-zinc-500 uppercase tracking-wider">Model</label>
          {provider === "ollama" ? (
            <select
              value={model}
              onChange={(e) => onUpdateConfigField(["llm", "model"], e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
            >
              {ollamaModels.length === 0 && <option value="">No models — pull one below</option>}
              {ollamaModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : provider === "vllm" ? (
            <select
              value={model}
              onChange={(e) => onUpdateConfigField(["llm", "model"], e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500"
            >
              {vllmModels.length === 0 && <option value="">Check server first</option>}
              {vllmModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => onUpdateConfigField(["llm", "model"], e.target.value)}
              placeholder={provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
            />
          )}
        </div>
      </div>

      {provider === "ollama" && (
        <div className="p-3 bg-zinc-900 rounded space-y-3">
          <div className="flex items-center gap-2">
            <Dot ok={ollamaOk} />
            <span className="text-xs text-zinc-400">
              {ollamaOk ? `Ollama · ${ollamaModels.length} model(s)` : "Ollama not installed"}
            </span>
            {!ollamaOk && (
              <button
                onClick={() => invoke("install_ollama")}
                className="ml-auto text-xs text-orange-400 hover:underline"
              >
                Install →
              </button>
            )}
          </div>
          {ollamaOk && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={pullTarget}
                  onChange={(e) => onSetPullTarget(e.target.value)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200 text-xs"
                >
                  {POPULAR_OLLAMA_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button
                  onClick={onPullModel}
                  disabled={pulling}
                  className="px-3 py-1 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                >
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

      <button
        onClick={onSaveConfig}
        className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 font-medium"
      >
        Save and continue →
      </button>
      {saveMsg && <p className="text-xs text-zinc-400">{saveMsg}</p>}

      {/* Import / Export */}
      <div className="pt-2 border-t border-zinc-800 space-y-3">
        <label className="text-xs text-zinc-500 uppercase tracking-wider">Import / Export</label>
        <div className="flex gap-2">
          <button
            onClick={onExportSettings}
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
            onChange={onImportFile}
          />
        </div>
        <p className="text-xs text-amber-600">Importing settings will overwrite your current configuration.</p>
        {settingsMsg && <p className="text-xs text-zinc-400">{settingsMsg}</p>}
      </div>
    </div>
  );
}
