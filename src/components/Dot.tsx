export function Dot({ ok, pulse }: { ok: boolean; pulse?: boolean }) {
  return (
    <div
      className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-green-400" : "bg-zinc-600"} ${pulse && ok ? "animate-pulse" : ""}`}
    />
  );
}
