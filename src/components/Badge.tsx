export function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded ${ok ? "bg-green-900 text-green-300" : "bg-zinc-800 text-zinc-500"}`}
    >
      {ok ? "connected" : "off"}
    </span>
  );
}
