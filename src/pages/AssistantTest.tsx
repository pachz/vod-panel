import { useCallback, useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { Plus, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { AssistantChat } from "@/components/assistant/AssistantChat";
import { SiteGPTComparePanel } from "@/components/assistant/SiteGPTComparePanel";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";

type AssistantAudienceTab = "members" | "public";

function parseAudienceTab(value: string | null): AssistantAudienceTab {
  return value === "public" ? "public" : "members";
}

const AssistantTest = () => {
  const { language } = useLanguage();
  const currentUser = useQuery(api.user.getCurrentUser);
  const canManageAssistant = (currentUser?.isGod ?? false) || (currentUser?.isTech ?? false);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseAudienceTab(searchParams.get("tab"));
  const [membersThreadId, setMembersThreadId] = useState<string | null>(
    () => (parseAudienceTab(searchParams.get("tab")) === "members" ? searchParams.get("thread") : null),
  );
  const [publicThreadId, setPublicThreadId] = useState<string | null>(
    () => (parseAudienceTab(searchParams.get("tab")) === "public" ? searchParams.get("thread") : null),
  );
  const createThread = useMutation(api.assistant.threads.createAssistantThread);
  const membersThreads = usePaginatedQuery(
    api.assistant.threads.listThreads,
    { audience: "members" },
    { initialNumItems: 20 },
  );
  const publicThreads = usePaginatedQuery(
    api.assistant.threads.listThreads,
    { audience: "public" },
    { initialNumItems: 20 },
  );

  const threadId = tab === "public" ? publicThreadId : membersThreadId;
  const threads = tab === "public" ? publicThreads : membersThreads;

  useEffect(() => {
    trackPosthogEvent("assistant_test_page_opened");
  }, []);

  const updateUrl = useCallback(
    (nextTab: AssistantAudienceTab, nextThreadId: string | null) => {
      const nextParams = new URLSearchParams(searchParams);
      if (nextTab === "public") {
        nextParams.set("tab", "public");
      } else {
        nextParams.delete("tab");
      }
      if (nextThreadId) {
        nextParams.set("thread", nextThreadId);
      } else {
        nextParams.delete("thread");
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const nextTab = parseAudienceTab(searchParams.get("tab"));
    const threadFromUrl = searchParams.get("thread");
    if (nextTab === "public") {
      setPublicThreadId(threadFromUrl);
    } else {
      setMembersThreadId(threadFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = useCallback(
    (value: string) => {
      const nextTab = parseAudienceTab(value);
      const nextThreadId = nextTab === "public" ? publicThreadId : membersThreadId;
      updateUrl(nextTab, nextThreadId);
    },
    [membersThreadId, publicThreadId, updateUrl],
  );

  const handleCreateThread = useCallback(async () => {
    const newThreadId = await createThread({ language, audience: tab });
    if (tab === "public") {
      setPublicThreadId(newThreadId);
    } else {
      setMembersThreadId(newThreadId);
    }
    updateUrl(tab, newThreadId);
    return newThreadId;
  }, [createThread, language, tab, updateUrl]);

  const handleStartNewConversation = useCallback(() => {
    if (tab === "public") {
      setPublicThreadId(null);
    } else {
      setMembersThreadId(null);
    }
    updateUrl(tab, null);
  }, [tab, updateUrl]);

  const handleSelectThread = useCallback(
    (selectedThreadId: string) => {
      if (tab === "public") {
        setPublicThreadId(selectedThreadId);
      } else {
        setMembersThreadId(selectedThreadId);
      }
      updateUrl(tab, selectedThreadId);
    },
    [tab, updateUrl],
  );

  return (
    <div
      className={cn(
        "mx-auto flex h-[calc(100vh-8rem)] flex-col gap-4",
        canManageAssistant ? "max-w-[90rem]" : "max-w-6xl",
      )}
      dir="ltr"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Reham Diva Assistant</h1>
          <p className="max-w-2xl text-muted-foreground">
            {tab === "public"
              ? "Test the public website assistant as an anonymous visitor. Uses the public prompt, tools, and greeting."
              : canManageAssistant
                ? "Compare the in-panel assistant with the live SiteGPT chatbot side by side."
                : "Discover femininity courses and self-love, and become the feminine woman you deserve to be."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LanguageToggle />
          <Button asChild variant="outline" size="sm">
            <Link to={tab === "public" ? "/assistant-settings?tab=public" : "/assistant-settings"}>
              <Settings2 className="h-4 w-4 me-2" />
              Assistant settings
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="public">Public</TabsTrigger>
        </TabsList>

        <div className="flex min-h-0 flex-1 gap-4">
          <aside className="hidden w-56 shrink-0 space-y-2 lg:block">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={handleStartNewConversation}
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4 me-2" />
              New conversation
            </Button>
            <p className="text-sm font-medium text-muted-foreground">Recent conversations</p>
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
                  {thread.title ?? "New conversation"}
                </Button>
              ))}
            </div>
          </aside>

          <div
            className={cn(
              "flex min-h-0 flex-1 gap-4",
              canManageAssistant ? "flex-col xl:flex-row" : "flex-col",
            )}
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit justify-start lg:hidden"
                onClick={handleStartNewConversation}
                aria-label="New conversation"
              >
                <Plus className="h-4 w-4 me-2" />
                New conversation
              </Button>
              {canManageAssistant && (
                <p className="text-sm font-medium text-muted-foreground">
                  {tab === "public" ? "Public website assistant" : "Members assistant"}
                </p>
              )}
              <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border/50 bg-card/50 p-4 shadow-card backdrop-blur sm:p-6">
                <AssistantChat
                  audience={tab}
                  threadId={threadId}
                  onCreateThread={handleCreateThread}
                />
              </div>
            </div>

            {canManageAssistant && (
              <div className="flex min-h-0 flex-1 flex-col xl:min-w-0">
                <SiteGPTComparePanel />
              </div>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
};

export default AssistantTest;
