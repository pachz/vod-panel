import { useUIMessages } from "@convex-dev/agent/react";
import { api } from "../../../convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AssistantMessage } from "./AssistantMessage";

type AssistantConversationTranscriptProps = {
  threadId: string;
};

export function AssistantConversationTranscript({
  threadId,
}: AssistantConversationTranscriptProps) {
  const { results: messages, status } = useUIMessages(
    api.assistant.threads.listThreadMessages,
    { threadId },
    { initialNumItems: 50, stream: false },
  );

  if (status === "LoadingFirstPage") {
    return <p className="p-4 text-sm text-muted-foreground">Loading conversation...</p>;
  }

  if (!messages.length) {
    return <p className="p-4 text-sm text-muted-foreground">No messages in this conversation.</p>;
  }

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="space-y-4 p-4">
        {messages.map((message) => (
          <AssistantMessage key={message.key} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
