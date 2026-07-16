import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { useUIMessages, optimisticallySendMessage } from "@convex-dev/agent/react";
import { Loader2, Send } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { AssistantMessage } from "./AssistantMessage";

type AssistantChatProps = {
  threadId: string | null;
  onCreateThread: () => Promise<string>;
};

const SUGGESTION_KEYS = [
  "assistantSuggestion1",
  "assistantSuggestion2",
  "assistantSuggestion3",
] as const;

export function AssistantChat({
  threadId,
  onCreateThread,
}: AssistantChatProps) {
  const { t, isRTL, language } = useLanguage();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(threadId);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveThreadId(threadId);
  }, [threadId]);

  const sendMessage = useMutation(api.assistant.messages.sendMessage).withOptimisticUpdate(
    (store, args) => {
      optimisticallySendMessage(api.assistant.threads.listThreadMessages)(store, {
        threadId: args.threadId,
        prompt: args.prompt,
      });
    },
  );

  const { results: messages } = useUIMessages(
    api.assistant.threads.listThreadMessages,
    activeThreadId ? { threadId: activeThreadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  const isStreaming = useMemo(
    () => messages?.some((message) => message.status === "streaming") ?? false,
    [messages],
  );

  useEffect(() => {
    if (!autoScroll) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, autoScroll, isStreaming]);

  const handleScroll = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!(viewport instanceof HTMLElement)) return;
    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    setAutoScroll(distanceFromBottom < 80);
  }, []);

  const handleSend = useCallback(
    async (promptValue?: string) => {
      const prompt = (promptValue ?? input).trim();
      if (!prompt || isSending) return;

      setError(null);
      setIsSending(true);
      setInput("");

      try {
        let nextThreadId = activeThreadId;
        if (!nextThreadId) {
          nextThreadId = await onCreateThread();
          setActiveThreadId(nextThreadId);
        }

        trackPosthogEvent("assistant_message_sent");
        await sendMessage({ threadId: nextThreadId, prompt, language });
      } catch {
        setError(t("assistantSendError"));
        trackPosthogEvent("assistant_error", { type: "send_message" });
        setInput(prompt);
      } finally {
        setIsSending(false);
      }
    },
    [activeThreadId, input, isSending, language, onCreateThread, sendMessage, t],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4" dir={isRTL ? "rtl" : "ltr"}>
      <ScrollArea
        ref={scrollAreaRef}
        className="min-h-[420px] flex-1 rounded-2xl border border-border/60 bg-card/40 p-4"
        onScrollCapture={handleScroll}
      >
        <div className="space-y-4 pb-4">
          {!activeThreadId || messages.length === 0 ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground">{t("assistantEmptyState")}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTION_KEYS.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleSend(t(key))}
                  >
                    {t(key)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <AssistantMessage key={message.key} message={message} />
          ))}

          {isSending || isStreaming ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("assistantThinking")}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p>{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => void handleSend()}
              >
                {t("assistantRetry")}
              </Button>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("assistantInputPlaceholder")}
          aria-label={t("assistantInputPlaceholder")}
          rows={3}
          disabled={isSending}
          dir={isRTL ? "rtl" : "ltr"}
          className="min-h-[88px] resize-none"
        />
        <Button
          type="button"
          variant="cta"
          size="icon"
          className="h-11 w-11 shrink-0"
          disabled={!input.trim() || isSending}
          aria-label={t("assistantSend")}
          onClick={() => void handleSend()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
