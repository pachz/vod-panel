import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePaginatedQuery } from "convex/react";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { AssistantConversationTranscript } from "@/components/assistant/AssistantConversationTranscript";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatUserLabel(user: { name: string | null; email: string | null; userId: string }) {
  if (user.name && user.email) {
    return `${user.name} (${user.email})`;
  }
  return user.name ?? user.email ?? user.userId;
}

function formatRelativeTime(timestamp: number | undefined) {
  if (!timestamp) {
    return null;
  }
  return new Date(timestamp).toLocaleString();
}

const AssistantConversations = () => {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  const users = usePaginatedQuery(
    api.assistant.conversations.listUsersWithConversations,
    {},
    { initialNumItems: 30 },
  );

  const threads = usePaginatedQuery(
    api.assistant.conversations.listConversationsForUser,
    selectedUserId ? { userId: selectedUserId } : "skip",
    { initialNumItems: 30 },
  );

  const selectedUser = useMemo(
    () => users.results?.find((user) => user.userId === selectedUserId) ?? null,
    [selectedUserId, users.results],
  );

  const selectedThread = useMemo(
    () => threads.results?.find((thread) => thread._id === selectedThreadId) ?? null,
    [selectedThreadId, threads.results],
  );

  const handleSelectUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setSelectedThreadId(null);
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-[90rem] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">All assistant conversations</h1>
          <p className="text-muted-foreground">
            Tech-only read access to every user&apos;s assistant threads.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/assistant-settings">
            <ArrowLeft className="me-2 h-4 w-4" />
            Back to settings
          </Link>
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[14rem_18rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col rounded-2xl border border-border/50 bg-card/50 p-3">
          <p className="mb-2 px-2 text-sm font-medium text-muted-foreground">Users</p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {users.results?.map((user) => (
              <Button
                key={user.userId}
                type="button"
                variant={user.userId === selectedUserId ? "default" : "ghost"}
                size="sm"
                className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-start"
                onClick={() => handleSelectUser(user.userId)}
              >
                <span className="line-clamp-2">{formatUserLabel(user)}</span>
              </Button>
            ))}
            {users.status === "LoadingFirstPage" ? (
              <p className="px-2 text-sm text-muted-foreground">Loading users...</p>
            ) : null}
            {users.status === "CanLoadMore" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => users.loadMore(30)}
              >
                Load more users
              </Button>
            ) : null}
            {users.status === "Exhausted" && (users.results?.length ?? 0) === 0 ? (
              <p className="px-2 text-sm text-muted-foreground">No conversations yet.</p>
            ) : null}
          </div>
        </aside>

        <aside className="flex min-h-0 flex-col rounded-2xl border border-border/50 bg-card/50 p-3">
          <p className="mb-2 px-2 text-sm font-medium text-muted-foreground">Conversations</p>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {!selectedUserId ? (
              <p className="px-2 text-sm text-muted-foreground">Select a user to see their threads.</p>
            ) : (
              <>
                {threads.results?.map((thread) => (
                  <Button
                    key={thread._id}
                    type="button"
                    variant={thread._id === selectedThreadId ? "default" : "ghost"}
                    size="sm"
                    className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2 text-start"
                    onClick={() => setSelectedThreadId(thread._id)}
                  >
                    <span className="line-clamp-2 font-medium">
                      {thread.title ?? "New conversation"}
                    </span>
                    {thread.latestMessage ? (
                      <span
                        className={cn(
                          "line-clamp-2 text-xs font-normal",
                          thread._id === selectedThreadId
                            ? "text-primary-foreground/80"
                            : "text-muted-foreground",
                        )}
                      >
                        {thread.latestMessage}
                      </span>
                    ) : null}
                  </Button>
                ))}
                {threads.status === "LoadingFirstPage" ? (
                  <p className="px-2 text-sm text-muted-foreground">Loading conversations...</p>
                ) : null}
                {threads.status === "CanLoadMore" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => threads.loadMore(30)}
                  >
                    Load more
                  </Button>
                ) : null}
                {threads.status === "Exhausted" && (threads.results?.length ?? 0) === 0 ? (
                  <p className="px-2 text-sm text-muted-foreground">No threads for this user.</p>
                ) : null}
              </>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col rounded-2xl border border-border/50 bg-card/50 shadow-card">
          {selectedThreadId ? (
            <>
              <div className="border-b border-border/50 px-4 py-3">
                <div className="flex items-start gap-2">
                  <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      {selectedThread?.title ?? "New conversation"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedUser ? formatUserLabel(selectedUser) : "Unknown user"}
                      {selectedThread?.lastMessageAt
                        ? ` · Last message ${formatRelativeTime(selectedThread.lastMessageAt)}`
                        : null}
                    </p>
                  </div>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <AssistantConversationTranscript threadId={selectedThreadId} />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
              Select a conversation to read the full transcript.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AssistantConversations;
