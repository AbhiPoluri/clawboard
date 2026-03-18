import { Step, ChannelStatus } from "../types";
import { Dot } from "./Dot";

interface StatusTabProps {
  step: Step;
  nodeOk: boolean | null;
  clawOk: boolean | null;
  configOk: boolean;
  channels: ChannelStatus[];
  running: boolean;
  installing: boolean;
  installMsg: string;
  doctorOutput: string;
  onRunChecks: () => void;
  onInstallOpenclaw: () => void;
  onToggleAgent: () => void;
  onCheckStatus: () => void;
  onDiagnostics: () => void;
  onGoToConfig: () => void;
}

export function StatusTab({
  step,
  nodeOk,
  clawOk,
  configOk,
  channels,
  running,
  installing,
  installMsg,
  doctorOutput,
  onRunChecks,
  onInstallOpenclaw,
  onToggleAgent,
  onCheckStatus,
  onDiagnostics,
  onGoToConfig,
}: StatusTabProps) {
  return (
    <div className="p-4 space-y-4">
      {step === "check" && (
        <p className="text-xs text-zinc-500 animate-pulse">Checking setup...</p>
      )}

      {step === "install_node" && (
        <div className="space-y-3">
          <p className="text-zinc-200 font-semibold text-xs">Step 1 — Install Node.js</p>
          <p className="text-xs text-zinc-500">Required to install OpenClaw.</p>
          <button
            onClick={() => window.open("https://nodejs.org/en/download")}
            className="w-full py-2 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
          >
            Open nodejs.org →
          </button>
          <button
            onClick={onRunChecks}
            className="w-full py-2 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            I installed it — retry
          </button>
        </div>
      )}

      {step === "install_openclaw" && (
        <div className="space-y-3">
          <p className="text-zinc-200 font-semibold text-xs">Step 2 — Install OpenClaw</p>
          <button
            onClick={onInstallOpenclaw}
            disabled={installing}
            className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {installing ? "Installing..." : "Install OpenClaw"}
          </button>
          {installMsg && <p className="text-xs text-zinc-400">{installMsg}</p>}
        </div>
      )}

      {step === "config" && (
        <div className="space-y-3">
          <p className="text-zinc-200 font-semibold text-xs">Step 3 — Connect AI</p>
          <p className="text-xs text-zinc-500">Choose a model provider to activate your agent.</p>
          <button
            onClick={onGoToConfig}
            className="w-full py-2.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
          >
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
            <span className="text-xs text-zinc-300 flex-1">
              Agent {running ? "running" : "stopped"}
            </span>
            <button
              onClick={onToggleAgent}
              className={`px-4 py-1.5 rounded text-xs font-medium ${
                running
                  ? "bg-red-900 text-red-300 hover:bg-red-800"
                  : "bg-green-900 text-green-300 hover:bg-green-800"
              }`}
            >
              {running ? "Stop" : "Start"}
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            <button
              onClick={onCheckStatus}
              className="flex-1 py-1.5 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            >
              Refresh
            </button>
            <button
              onClick={onDiagnostics}
              className="flex-1 py-1.5 rounded text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            >
              Diagnostics
            </button>
          </div>
          {doctorOutput && (
            <pre className="p-3 bg-zinc-900 rounded text-xs text-zinc-400 whitespace-pre-wrap max-h-48 overflow-auto">
              {doctorOutput}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
