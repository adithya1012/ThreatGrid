import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage, SSEEvent } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const API_BASE = (import.meta as { env: Record<string, string> }).env
  .VITE_API_BASE_URL ?? "";

function getUserId(): string {
  try {
    const raw = localStorage.getItem("soc_user");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { id?: string };
    return parsed.id ?? "";
  } catch {
    return "";
  }
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Welcome message
// ---------------------------------------------------------------------------
const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm your **SOC AI Analyst**. I can query your uploaded session data to help you investigate threats, anomalies, and user behaviour.\n\nAsk me anything — for example:\n- *What are the top threats in this session?*\n- *Show me all blocked requests from the finance department.*\n- *Which users have the most anomalies?*",
  isStreaming: false,
  toolsUsed: [],
  createdAt: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ToolCallIndicatorProps {
  text: string;
}

function ToolCallIndicator({ text }: ToolCallIndicatorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-950/60 border border-blue-800/50 text-blue-300 text-xs w-fit max-w-[90%]">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      <span className="font-mono">{text}</span>
    </div>
  );
}

interface MessageBubbleProps {
  msg: ChatMessage;
}

function MessageBubble({ msg }: MessageBubbleProps) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-3 py-2 rounded-2xl rounded-tl-sm bg-gray-800 border border-gray-700/60 text-gray-100 text-sm leading-relaxed">
        {msg.content ? (
          <div className="prose prose-invert prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-gray-700/60 [&_pre]:rounded-lg [&_pre]:p-3 [&_table]:text-xs [&_th]:text-gray-300 [&_td]:border-gray-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        ) : (
          <span className="inline-flex gap-1 items-center text-gray-400">
            <span className="animate-bounce [animation-delay:0ms]">·</span>
            <span className="animate-bounce [animation-delay:150ms]">·</span>
            <span className="animate-bounce [animation-delay:300ms]">·</span>
          </span>
        )}
        {msg.toolsUsed.length > 0 && !msg.isStreaming && (
          <div className="mt-2 pt-2 border-t border-gray-700/60 flex flex-wrap gap-1">
            {msg.toolsUsed.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-700/80 text-gray-400 border border-gray-600/50"
              >
                🔧 {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------
interface ChatPanelProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ sessionId, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --------------------------------------------------------------------------
  // Auto-scroll on new content
  // --------------------------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeToolCall]);

  // --------------------------------------------------------------------------
  // Load history when panel first opens
  // --------------------------------------------------------------------------
  const loadHistory = useCallback(async () => {
    if (historyLoaded) return;
    setHistoryLoaded(true);
    try {
      const userId = getUserId();
      const res = await fetch(`${API_BASE}/api/chat/${sessionId}/history`, {
        headers: { "x-user-id": userId },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        messages: {
          id: string;
          role: "user" | "assistant";
          content: string;
          tools_used: string[] | null;
          created_at: string;
        }[];
      };
      if (!data.messages.length) return;
      const historical: ChatMessage[] = data.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        isStreaming: false,
        toolsUsed: m.tools_used ?? [],
        createdAt: m.created_at,
      }));
      // Prepend before the welcome message
      setMessages([...historical, WELCOME]);
    } catch {
      // silently ignore
    }
  }, [sessionId, historyLoaded]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
      setTimeout(() => textareaRef.current?.focus(), 300);
    }
  }, [isOpen, loadHistory]);

  // --------------------------------------------------------------------------
  // Send message via SSE stream
  // --------------------------------------------------------------------------
  async function sendMessage() {
    const text = inputValue.trim();
    if (!text || isSending) return;

    const userId = getUserId();
    setInputValue("");
    setIsSending(true);
    setActiveToolCall(null);

    // Append user message immediately
    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      content: text,
      isStreaming: false,
      toolsUsed: [],
      createdAt: new Date().toISOString(),
    };

    // Placeholder streaming assistant message
    const assistantId = makeId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      toolsUsed: [],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const response = await fetch(`${API_BASE}/api/chat/${sessionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => "Unknown error");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${errText}`, isStreaming: false }
              : m
          )
        );
        setIsSending(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastEventType = "";
      const toolsUsedSet: Set<string> = new Set();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep incomplete last line in buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed.startsWith("event:")) {
            lastEventType = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith("data:")) {
            const raw = trimmed.slice(5).trim();
            let event: SSEEvent;
            try {
              const parsed = JSON.parse(raw) as Record<string, unknown>;
              // Map the parsed object + lastEventType into an SSEEvent
              if (lastEventType === "text") {
                event = { type: "text", chunk: String(parsed.chunk ?? "") };
              } else if (lastEventType === "tool_call") {
                event = { type: "tool_call", message: String(parsed.message ?? "") };
              } else if (lastEventType === "done") {
                event = { type: "done", message: String(parsed.message ?? "") };
              } else if (lastEventType === "error") {
                event = { type: "error", message: String(parsed.message ?? "") };
              } else {
                continue;
              }
            } catch {
              continue;
            }

            if (event.type === "tool_call") {
              setActiveToolCall(event.message);
              // Extract tool name from message for badge (e.g. "📋 Reading database schema..." → "get_db_context")
              const toolName = event.message.includes("schema")
                ? "get_db_context"
                : event.message.includes("quer") || event.message.includes("Execut")
                ? "run_read_query"
                : event.message;
              toolsUsedSet.add(toolName);
            } else if (event.type === "text") {
              setActiveToolCall(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.chunk }
                    : m
                )
              );
            } else if (event.type === "done") {
              setActiveToolCall(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, isStreaming: false, toolsUsed: [...toolsUsedSet] }
                    : m
                )
              );
            } else if (event.type === "error") {
              setActiveToolCall(null);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: `⚠️ ${event.message}`,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          }
        }
      }
    } catch (err) {
      setActiveToolCall(null);
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `⚠️ ${msg}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <>
      {/* Backdrop on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={[
          "fixed inset-y-0 right-0 z-50 w-full sm:w-[420px]",
          "flex flex-col bg-gray-900 border-l border-gray-700/80 shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm shrink-0">
              🤖
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">SOC AI Analyst</p>
              <p className="text-[11px] text-gray-400 leading-tight">OpenAI + MCP Tools</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="Close chat panel"
          >
            ✕
          </button>
        </div>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {activeToolCall && <ToolCallIndicator text={activeToolCall} />}
          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div className="shrink-0 px-3 py-3 bg-gray-800 border-t border-gray-700/80">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about threats, anomalies, users…"
              disabled={isSending}
              rows={2}
              className={[
                "flex-1 resize-none rounded-xl px-3 py-2 text-sm",
                "bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-500",
                "focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "transition-colors",
              ].join(" ")}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={isSending || !inputValue.trim()}
              className={[
                "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                "bg-blue-600 hover:bg-blue-500 text-white",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "transition-colors",
              ].join(" ")}
              aria-label="Send message"
            >
              {isSending ? (
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5 text-center">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </>
  );
}
