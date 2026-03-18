import { useState, useEffect, useRef } from "react";

type Tab = "status" | "channels" | "logs" | "config" | "persona" | "history";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (tab: Tab) => void;
  onStartAgent: () => void;
  onStopAgent: () => void;
  onRunDiagnostics: () => void;
  onExportSettings: () => void;
  onImportSettings: () => void;
  onStartLogStreaming: () => void;
  onStopLogStreaming: () => void;
  onExportLogs: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onStartAgent,
  onStopAgent,
  onRunDiagnostics,
  onExportSettings,
  onImportSettings,
  onStartLogStreaming,
  onStopLogStreaming,
  onExportLogs,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: "nav-status",   label: "Go to Status",   shortcut: "⌘1", category: "Navigation", action: () => { onNavigate("status");   onClose(); } },
    { id: "nav-channels", label: "Go to Channels", shortcut: "⌘2", category: "Navigation", action: () => { onNavigate("channels"); onClose(); } },
    { id: "nav-logs",     label: "Go to Logs",     shortcut: "⌘3", category: "Navigation", action: () => { onNavigate("logs");     onClose(); } },
    { id: "nav-config",   label: "Go to Config",   shortcut: "⌘4", category: "Navigation", action: () => { onNavigate("config");   onClose(); } },
    { id: "nav-persona",  label: "Go to Persona",  shortcut: "⌘5", category: "Navigation", action: () => { onNavigate("persona");  onClose(); } },
    { id: "nav-history",  label: "Go to History",  shortcut: "⌘6", category: "Navigation", action: () => { onNavigate("history");  onClose(); } },
    { id: "agent-start",  label: "Start Agent",   category: "Agent",       action: () => { onStartAgent();       onClose(); } },
    { id: "agent-stop",   label: "Stop Agent",    category: "Agent",       action: () => { onStopAgent();        onClose(); } },
    { id: "diagnostics",  label: "Run Diagnostics", category: "Diagnostics", action: () => { onRunDiagnostics();  onClose(); } },
    { id: "settings-export", label: "Export Settings", category: "Settings", action: () => { onExportSettings(); onClose(); } },
    { id: "settings-import", label: "Import Settings", category: "Settings", action: () => { onImportSettings(); onClose(); } },
    { id: "logs-start",   label: "Start Log Streaming", category: "Logs", action: () => { onStartLogStreaming(); onClose(); } },
    { id: "logs-stop",    label: "Stop Log Streaming",  category: "Logs", action: () => { onStopLogStreaming();  onClose(); } },
    { id: "logs-export",  label: "Export Logs",         category: "Logs", action: () => { onExportLogs();       onClose(); } },
  ];

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed === ""
    ? commands
    : commands.filter((c) => c.label.toLowerCase().includes(trimmed));

  const groups: Record<string, Command[]> = {};
  for (const cmd of filtered) {
    if (!groups[cmd.category]) groups[cmd.category] = [];
    groups[cmd.category].push(cmd);
  }

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        filtered[selectedIdx]?.action();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, filtered, selectedIdx, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="border-b border-zinc-700 px-3 py-2.5 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-zinc-200 placeholder-zinc-500 text-sm outline-none"
          />
          <kbd className="text-zinc-600 text-xs font-mono bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">esc</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-6">No matching commands</p>
          ) : (
            Object.entries(groups).map(([category, cmds]) => (
              <div key={category}>
                <p className="text-zinc-500 text-xs px-3 pt-3 pb-1 uppercase tracking-wider font-medium">
                  {category}
                </p>
                {cmds.map((cmd) => {
                  const globalIdx = filtered.indexOf(cmd);
                  const isSelected = globalIdx === selectedIdx;
                  return (
                    <button
                      key={cmd.id}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between text-sm transition-colors border-l-2 ${
                        isSelected
                          ? "bg-orange-500/10 border-orange-400 text-zinc-100"
                          : "bg-transparent border-transparent text-zinc-200 hover:bg-zinc-800"
                      }`}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                    >
                      <span>{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="text-zinc-500 text-xs ml-2 flex-shrink-0 font-mono">{cmd.shortcut}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-zinc-800 px-3 py-1.5 flex items-center gap-3 text-zinc-600 text-xs">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
