import { ChannelStatus, CHANNEL_ICONS, CHANNEL_SETUP } from "../types";
import { Badge } from "./Badge";

interface ChannelsTabProps {
  channels: ChannelStatus[];
  expandedChannel: string | null;
  channelTokens: Record<string, string>;
  channelMsg: Record<string, string>;
  onToggleChannel: (ch: ChannelStatus) => void;
  onConnectChannel: (name: string) => void;
  onLoadChannels: () => void;
  onSetChannelTokens: (tokens: Record<string, string>) => void;
}

export function ChannelsTab({
  channels,
  expandedChannel,
  channelTokens,
  channelMsg,
  onToggleChannel,
  onConnectChannel,
  onLoadChannels,
  onSetChannelTokens,
}: ChannelsTabProps) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-zinc-500 mb-3">Connect messaging platforms to your agent.</p>
      {channels.map((ch) => {
        const setup = CHANNEL_SETUP[ch.name];
        const isExpanded = expandedChannel === ch.name;
        return (
          <div key={ch.name} className="bg-zinc-900 rounded overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <span className="text-base">{CHANNEL_ICONS[ch.name]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 capitalize">{ch.name}</p>
                <p className="text-xs text-zinc-500 truncate">{ch.description}</p>
              </div>
              <Badge ok={ch.connected} />
              <button
                onClick={() => onToggleChannel(ch)}
                className={`ml-2 px-2.5 py-1 rounded text-xs ${
                  ch.connected
                    ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    : "bg-orange-500 text-white hover:bg-orange-600"
                }`}
              >
                {ch.connected ? "Disconnect" : "Connect"}
              </button>
            </div>

            {isExpanded && setup && (
              <div className="px-3 pb-3 border-t border-zinc-800 pt-3 space-y-2">
                {setup.note && <p className="text-xs text-zinc-500">{setup.note}</p>}
                {setup.url && (
                  <a
                    href={setup.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-orange-400 hover:underline block"
                  >
                    {setup.url} ↗
                  </a>
                )}
                {ch.name !== "imessage" && (
                  <>
                    <input
                      type="password"
                      placeholder={setup.placeholder}
                      value={channelTokens[ch.name] ?? ""}
                      onChange={(e) =>
                        onSetChannelTokens({ ...channelTokens, [ch.name]: e.target.value })
                      }
                      className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-orange-500 placeholder:text-zinc-600"
                    />
                    <button
                      onClick={() => onConnectChannel(ch.name)}
                      className="w-full py-1.5 rounded text-xs bg-orange-500 text-white hover:bg-orange-600"
                    >
                      Connect
                    </button>
                  </>
                )}
                {channelMsg[ch.name] && (
                  <p className="text-xs text-zinc-400">{channelMsg[ch.name]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onLoadChannels}
        className="mt-2 text-xs text-zinc-500 hover:text-zinc-300"
      >
        Refresh
      </button>
    </div>
  );
}
