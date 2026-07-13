import { useCallback, useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Plus, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { SiteGPTComparePanel } from "@/components/assistant/SiteGPTComparePanel";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

const AssistantTest = () => {
  const { t, isRTL, language } = useLanguage();
  const currentUser = useQuery(api.user.getCurrentUser);
  const isTech = currentUser?.isTech ?? false;
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
      className={cn(
        "mx-auto flex h-[calc(100vh-8rem)] flex-col gap-4",
        isTech ? "max-w-[90rem]" : "max-w-6xl",
      )}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Reham Diva Assistant</h1>
          <p className="max-w-2xl text-muted-foreground">
            {isTech
              ? "Compare the in-panel assistant with the live SiteGPT chatbot side by side."
              : t("assistantTagline")}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/assistant-settings">
            <Settings2 className="h-4 w-4 me-2" />
            Assistant settings
          </Link>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
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

        <div
          className={cn(
            "flex min-h-0 flex-1 gap-4",
            isTech ? "flex-col xl:flex-row" : "flex-col",
          )}
        >
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
            {isTech && (
              <p className="text-sm font-medium text-muted-foreground">In-panel assistant</p>
            )}
            <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border/50 bg-card/50 p-4 shadow-card backdrop-blur sm:p-6">
              <AssistantChat threadId={threadId} onCreateThread={handleCreateThread} />
            </div>
          </div>

          {isTech && (
            <div className="flex min-h-0 flex-1 flex-col xl:min-w-0">
              <SiteGPTComparePanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssistantTest;
