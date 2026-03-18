import { RefObject } from "react";
import { LogFilter } from "../types";
import { Dot } from "./Dot";

interface LogsTabProps {
  logs: string[];
  streaming: boolean;
  logSearch: string;
  logFilter: LogFilter;
  exportMsg: string;
  logsEndRef: RefObject<HTMLDivElement | null>;
  onStartStreaming: () => void;
  onClearLogs: () => void;
  onSetLogSearch: (v: string) => void;
  onSetLogFilter: (f: LogFilter) => void;
  onExportLogs: (content: string) => void;
}

export function LogsTab({
  logs,
  streaming,
  logSearch,
  logFilter,
  exportMsg,
  logsEndRef,
  onStartStreaming,
  onClearLogs,
  onSetLogSearch,
  onSetLogFilter,
  onExportLogs,
}: LogsTabProps) {
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
      {/* Top bar: stream controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <Dot ok={streaming} pulse />
        <span className="text-xs text-zinc-500">{streaming ? "streaming" : "idle"}</span>
        <button onClick={onStartStreaming} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">
          {streaming ? "Restart" : "Start streaming"}
        </button>
        <button onClick={onClearLogs} className="text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={logSearch}
            onChange={(e) => onSetLogSearch(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-zinc-500 whitespace-nowrap">{filtered.length}/{logs.length} lines</span>
          <button
            onClick={() => onExportLogs(filtered.join("\n"))}
            className="px-3 py-1.5 rounded text-xs bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border border-zinc-600 whitespace-nowrap"
          >
            Export
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "error", "warn", "info"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onSetLogFilter(f)}
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
              <div
                key={i}
                className={`text-xs font-mono leading-relaxed ${
                  isError ? "text-red-400" : isWarn ? "text-yellow-400" : "text-zinc-400"
                }`}
              >
                {line}
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
