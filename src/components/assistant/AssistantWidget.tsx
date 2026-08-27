import { useCallback, useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useLocation } from "react-router-dom";
import { Bot, History, Plus, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

const THREAD_STORAGE_KEY = "reham-assistant-widget-thread";

function readStoredThreadId(): string | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  return sessionStorage.getItem(THREAD_STORAGE_KEY);
}

function storeThreadId(threadId: string | null) {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  if (threadId) {
    sessionStorage.setItem(THREAD_STORAGE_KEY, threadId);
    return;
  }
  sessionStorage.removeItem(THREAD_STORAGE_KEY);
}

export function AssistantWidget() {
  const location = useLocation();
  const { t, language, isRTL } = useLanguage();
  const currentUser = useQuery(api.user.getCurrentUser);
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(readStoredThreadId);
  const createThread = useMutation(api.assistant.threads.createAssistantThread);
  const threads = usePaginatedQuery(
    api.assistant.threads.listThreads,
    open ? {} : "skip",
    { initialNumItems: 8 },
  );

  const isTech = currentUser?.isTech === true;
  const isAssistantTestPage =
    location.pathname === "/assistant-test" || location.pathname.startsWith("/assistant-test/");

  useEffect(() => {
    storeThreadId(threadId);
  }, [threadId]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    trackPosthogEvent(nextOpen ? "assistant_widget_opened" : "assistant_widget_closed");
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        handleOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleOpenChange, open]);

  const handleCreateThread = useCallback(async () => {
    const newThreadId = await createThread({ language });
    setThreadId(newThreadId);
    return newThreadId;
  }, [createThread, language]);

  const handleStartNewConversation = useCallback(() => {
    setThreadId(null);
  }, []);

  const handleSelectThread = useCallback((selectedThreadId: string) => {
    setThreadId(selectedThreadId);
  }, []);

  if (!isTech || isAssistantTestPage) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3" dir="ltr">
      {open ? (
        <section
          role="dialog"
          aria-label={t("assistantTitle")}
          className={cn(
            "pointer-events-auto flex h-[min(36rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/95 shadow-card backdrop-blur",
            isRTL && "assistant-rtl",
          )}
          dir={isRTL ? "rtl" : "ltr"}
        >
          <header className="flex shrink-0 items-center gap-1 border-b border-border/40 px-3 py-2">
            <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{t("assistantTitle")}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={t("assistantConversationHistory")}
                >
                  <History className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
                <DropdownMenuLabel>{t("assistantConversationHistory")}</DropdownMenuLabel>
                {threads.results?.length ? (
                  threads.results.map((thread) => (
                    <DropdownMenuItem
                      key={thread._id}
                      onSelect={() => handleSelectThread(thread._id)}
                      className={cn(thread._id === threadId && "bg-accent")}
                    >
                      <span className="truncate">{thread.title ?? t("assistantNewConversation")}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>{t("assistantNoConversations")}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleStartNewConversation}
              aria-label={t("assistantNewConversation")}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleOpenChange(false)}
              aria-label={t("assistantCloseChat")}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <AssistantChat compact threadId={threadId} onCreateThread={handleCreateThread} />
          </div>
        </section>
      ) : null}

      <Button
        type="button"
        variant="cta"
        size="icon"
        className="pointer-events-auto h-14 w-14 rounded-full shadow-lg [&_svg]:size-6"
        aria-label={open ? t("assistantCloseChat") : t("assistantOpenChat")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => handleOpenChange(!open)}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </Button>
    </div>
  );
}
