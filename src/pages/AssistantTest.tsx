import { useCallback, useEffect, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserProfile } from "@/components/UserProfile";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";

const AssistantTest = () => {
  const { t, isRTL, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [threadId, setThreadId] = useState<string | null>(searchParams.get("thread"));
  const createThread = useMutation(api.assistant.threads.createAssistantThread);
  const threads = usePaginatedQuery(
    api.assistant.threads.listThreads,
    {},
    { initialNumItems: 12 },
  );

  useEffect(() => {
    trackPosthogEvent("assistant_test_page_opened");
  }, []);

  useEffect(() => {
    const threadFromUrl = searchParams.get("thread");
    setThreadId(threadFromUrl);
  }, [searchParams]);

  const handleCreateThread = useCallback(async () => {
    const newThreadId = await createThread({ language });
    setThreadId(newThreadId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("thread", newThreadId);
    setSearchParams(nextParams, { replace: true });
    return newThreadId;
  }, [createThread, language, searchParams, setSearchParams]);

  const handleStartNewConversation = useCallback(() => {
    setThreadId(null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("thread");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSelectThread = useCallback(
    (selectedThreadId: string) => {
      setThreadId(selectedThreadId);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("thread", selectedThreadId);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <div
      className="relative min-h-screen bg-background"
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-cta/5 to-transparent" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Reham Diva</h1>
            <p className="max-w-2xl text-muted-foreground">{t("assistantTagline")}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />
            <UserProfile />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 gap-4">
          <aside className="hidden w-56 shrink-0 space-y-2 lg:block">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleStartNewConversation}
              aria-label={t("assistantNewConversation")}
            >
              <Plus className="h-4 w-4 me-2" />
              {t("assistantNewConversation")}
            </Button>
            <p className="text-sm font-medium text-muted-foreground">{t("assistantConversationHistory")}</p>
            <div className="space-y-1">
              {threads.results?.map((thread) => (
                <Button
                  key={thread._id}
                  type="button"
                  variant={thread._id === threadId ? "default" : "ghost"}
                  size="sm"
                  className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-start"
                  onClick={() => handleSelectThread(thread._id)}
                >
                  {thread.title ?? t("assistantNewConversation")}
                </Button>
              ))}
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit justify-start lg:hidden"
              onClick={handleStartNewConversation}
              aria-label={t("assistantNewConversation")}
            >
              <Plus className="h-4 w-4 me-2" />
              {t("assistantNewConversation")}
            </Button>
            <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border/50 bg-card/50 p-4 shadow-card backdrop-blur sm:p-6">
              <AssistantChat
                threadId={threadId}
                onCreateThread={handleCreateThread}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AssistantTest;
