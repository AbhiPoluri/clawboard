import { useMemo } from "react";

interface HistoryEntry {
  timestamp: string;
  channel: string;
  user_message: string;
  agent_response: string;
  user_name?: string;
}

interface AnalyticsTabProps {
  history: HistoryEntry[];
}

const CHANNEL_COLORS: Record<string, string> = {
  imessage: "#3b82f6",
  whatsapp: "#22c55e",
  telegram: "#06b6d4",
  discord: "#6366f1",
  slack: "#a855f7",
};

const CHANNEL_LABELS: Record<string, string> = {
  imessage: "iMessage",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  // Clamp to avoid full-circle degenerate path
  const clampedEnd = Math.min(endAngle, startAngle + 359.99);
  const start = polarToCartesian(cx, cy, r, clampedEnd);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = clampedEnd - startAngle > 180 ? "1" : "0";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function AnalyticsTab({ history }: AnalyticsTabProps) {
  const stats = useMemo(() => {
    if (history.length === 0) return null;

    const total = history.length;

    const avgResponseLen = Math.round(
      history.reduce((sum, e) => sum + e.agent_response.length, 0) / total
    );

    const channelCounts: Record<string, number> = {};
    history.forEach((e) => {
      channelCounts[e.channel] = (channelCounts[e.channel] || 0) + 1;
    });

    const mostActiveChannel =
      Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const hourCounts: Record<number, number> = {};
    history.forEach((e) => {
      try {
        const h = new Date(e.timestamp).getHours();
        hourCounts[h] = (hourCounts[h] || 0) + 1;
      } catch {
        /* ignore invalid dates */
      }
    });
    const busiestHourEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
    const busiestHourStr = busiestHourEntry
      ? (() => {
          const h = parseInt(busiestHourEntry[0]);
          return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
        })()
      : "—";

    // Last 14 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { label: string; date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = i === 0 ? "Today" : `${d.getMonth() + 1}/${d.getDate()}`;
      days.push({ label, date: dateStr, count: 0 });
    }
    history.forEach((e) => {
      try {
        const dateStr = new Date(e.timestamp).toISOString().slice(0, 10);
        const day = days.find((d) => d.date === dateStr);
        if (day) day.count++;
      } catch {
        /* ignore */
      }
    });

    const channelBreakdown = Object.entries(channelCounts)
      .map(([channel, count]) => ({
        channel,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekHistory = history.filter((e) => {
      try {
        return new Date(e.timestamp) >= weekAgo;
      } catch {
        return false;
      }
    });
    const weekChannels = new Set(weekHistory.map((e) => e.channel)).size;

    return {
      total,
      avgResponseLen,
      mostActiveChannel,
      busiestHourStr,
      days,
      channelBreakdown,
      weekHistory,
      weekChannels,
    };
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-zinc-600">
        <span className="text-4xl">📊</span>
        <p className="text-xs">No data yet — conversations will appear here</p>
      </div>
    );
  }

  if (!stats) return null;

  // Bar chart
  const BAR_AREA_W = 360;
  const BAR_H = 72;
  const barCount = stats.days.length;
  const slotW = BAR_AREA_W / barCount;
  const barWidth = Math.max(1, slotW - 3);
  const maxCount = Math.max(...stats.days.map((d) => d.count), 1);

  // Donut chart
  const DONUT_R = 34;
  const DONUT_CX = 44;
  const DONUT_CY = 44;
  const STROKE_W = 13;

  let currentAngle = 0;
  const donutSegments = stats.channelBreakdown.map(({ channel, count }) => {
    const angle = (count / stats.total) * 360;
    const seg = {
      channel,
      count,
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: CHANNEL_COLORS[channel] ?? "#71717a",
    };
    currentAngle += angle;
    return seg;
  });

  return (
    <div className="flex flex-col gap-3 p-4 overflow-auto">
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Total Messages", value: String(stats.total), accent: true },
          { label: "Avg Response", value: `${stats.avgResponseLen} chars`, accent: false },
          {
            label: "Top Channel",
            value: CHANNEL_LABELS[stats.mostActiveChannel] ?? stats.mostActiveChannel,
            accent: false,
          },
          { label: "Busiest Hour", value: stats.busiestHourStr, accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-zinc-900 rounded-xl border border-zinc-800 px-3 py-2.5">
            <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
            <p className={`text-sm font-semibold ${accent ? "text-orange-400" : "text-zinc-200"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Bar chart — last 14 days */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3">
        <p className="text-xs text-zinc-400 mb-2">Messages — Last 14 Days</p>
        <svg
          width="100%"
          viewBox={`0 0 ${BAR_AREA_W} ${BAR_H + 16}`}
          className="overflow-visible"
          preserveAspectRatio="none"
        >
          {stats.days.map((day, i) => {
            const barH = Math.max(day.count > 0 ? 2 : 0, (day.count / maxCount) * BAR_H);
            const x = i * slotW + 1.5;
            const y = BAR_H - barH;
            const isToday = i === 13;
            const showLabel = i === 0 || i === 7 || i === 13;
            return (
              <g key={day.date}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={2}
                  fill={isToday ? "#f97316" : "#3f3f46"}
                />
                {day.count > 0 && barH > 10 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 2}
                    textAnchor="middle"
                    fill="#a1a1aa"
                    fontSize="7"
                  >
                    {day.count}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={x + barWidth / 2}
                    y={BAR_H + 13}
                    textAnchor="middle"
                    fill="#52525b"
                    fontSize="8"
                  >
                    {day.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Channel breakdown */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3">
        <p className="text-xs text-zinc-400 mb-2">Channel Breakdown</p>
        {stats.channelBreakdown.length === 0 ? (
          <p className="text-xs text-zinc-600">No channel data</p>
        ) : (
          <div className="flex items-center gap-4">
            {/* Donut */}
            <svg
              width={DONUT_CX * 2}
              height={DONUT_CY * 2}
              viewBox={`0 0 ${DONUT_CX * 2} ${DONUT_CY * 2}`}
              style={{ flexShrink: 0 }}
            >
              {donutSegments.length === 1 ? (
                <circle
                  cx={DONUT_CX}
                  cy={DONUT_CY}
                  r={DONUT_R}
                  fill="none"
                  stroke={donutSegments[0].color}
                  strokeWidth={STROKE_W}
                />
              ) : (
                donutSegments.map((seg) => (
                  <path
                    key={seg.channel}
                    d={describeArc(DONUT_CX, DONUT_CY, DONUT_R, seg.startAngle, seg.endAngle)}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={STROKE_W}
                    strokeLinecap="butt"
                  />
                ))
              )}
              <text
                x={DONUT_CX}
                y={DONUT_CY + 4}
                textAnchor="middle"
                fill="#e4e4e7"
                fontSize="12"
                fontWeight="bold"
              >
                {stats.total}
              </text>
            </svg>

            {/* Legend */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {stats.channelBreakdown.map(({ channel, count, pct }) => (
                <div key={channel} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CHANNEL_COLORS[channel] ?? "#71717a" }}
                  />
                  <span className="text-xs text-zinc-300 flex-1 truncate">
                    {CHANNEL_LABELS[channel] ?? channel}
                  </span>
                  <span className="text-xs text-zinc-500">{count}</span>
                  <span className="text-xs text-zinc-600 w-8 text-right">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Weekly summary */}
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-3">
        <p className="text-xs text-zinc-400 mb-2">Weekly Summary</p>
        <div className="space-y-1">
          <p className="text-xs text-zinc-300">
            <span className="text-orange-400 font-semibold">{stats.weekHistory.length}</span>{" "}
            message{stats.weekHistory.length !== 1 ? "s" : ""} this week
            {stats.weekChannels > 0 &&
              ` across ${stats.weekChannels} channel${stats.weekChannels !== 1 ? "s" : ""}`}
          </p>
          <p className="text-xs text-zinc-500">
            Most active on{" "}
            {CHANNEL_LABELS[stats.mostActiveChannel] ?? stats.mostActiveChannel} · peaks at{" "}
            {stats.busiestHourStr}
          </p>
          <p className="text-xs text-zinc-600">
            Avg response {stats.avgResponseLen} chars across {stats.total} conversation
            {stats.total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
