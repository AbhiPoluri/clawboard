export type Tab = "status" | "channels" | "config" | "persona" | "history" | "logs" | "analytics";
export type Provider = "anthropic" | "openai" | "ollama" | "vllm";
export type Step = "check" | "install_node" | "install_openclaw" | "config" | "ready";
export type LogFilter = "all" | "error" | "warn" | "info";

export interface Config {
  llm?: {
    provider?: string;
    api_key?: string;
    model?: string;
    base_url?: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  };
  [key: string]: unknown;
}

export interface ChannelStatus {
  name: string;
  connected: boolean;
  description: string;
}

export const CHANNEL_ICONS: Record<string, string> = {
  imessage: "💬", whatsapp: "🟢", telegram: "✈️", discord: "🎮", slack: "⚡"
};

export const CHANNEL_SETUP: Record<string, { label: string; placeholder: string; url?: string; note?: string }> = {
  imessage: { label: "No token needed", placeholder: "", note: "Requires macOS — enabled automatically when openclaw runs." },
  whatsapp: { label: "WhatsApp token", placeholder: "Paste token from openclaw whatsapp:setup", url: "https://docs.openclaw.ai/channels/whatsapp" },
  telegram: { label: "Bot token", placeholder: "123456:ABC-DEF...", url: "https://t.me/botfather", note: "Create a bot with @BotFather, paste the token." },
  discord: { label: "Bot token", placeholder: "MTA0...", url: "https://discord.com/developers/applications", note: "Create a bot in Discord Dev Portal, copy Bot Token." },
  slack: { label: "Bot token", placeholder: "xoxb-...", url: "https://api.slack.com/apps", note: "Create a Slack app, install to workspace, copy Bot User OAuth Token." },
};

export const POPULAR_OLLAMA_MODELS = ["llama3.2", "llama3.1", "mistral", "phi4", "gemma3", "qwen2.5", "deepseek-r1"];
