import { Badge } from "@/components/ui/badge";
import { SITEGPT_CHATBOT_ID, SITEGPT_INLINE_EMBED_URL } from "@/lib/sitegpt";

export function SiteGPTComparePanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold">SiteGPT</h2>
          <p className="text-xs text-muted-foreground">Production chatbot for side-by-side comparison</p>
        </div>
        <Badge variant="secondary">Compare</Badge>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/50 shadow-card">
        <iframe
          className="sitegpt-chat-iframe h-full min-h-[28rem] w-full border-0"
          data-sitegpt-id={SITEGPT_CHATBOT_ID}
          src={SITEGPT_INLINE_EMBED_URL}
          title="SiteGPT chatbot"
        />
      </div>
    </div>
  );
}
