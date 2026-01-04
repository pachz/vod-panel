import { Video } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type VideoPlayerProps = {
  videoEmbedUrl: string | null;
  activeLesson: LessonDoc | null;
  courseName: string;
  courseTrialVideoUrl?: string | null;
  language: string;
  t: (key: string) => string;
};

const getVimeoEmbedUrl = (url?: string | null) => {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);

  if (match) {
    return `https://player.vimeo.com/video/${match[1]}`;
  }

  return trimmed;
};

export const VideoPlayer = ({
  videoEmbedUrl,
  activeLesson,
  courseName,
  courseTrialVideoUrl,
  language,
  t,
}: VideoPlayerProps) => {
  const videoTitle = activeLesson 
    ? (language === "ar" ? activeLesson.title_ar : activeLesson.title) 
    : courseName;

  return (
    <Card className="overflow-hidden border-none bg-card/80 shadow-lg">
      <CardContent className="p-0">
        {videoEmbedUrl ? (
          <div className="aspect-video w-full">
            <iframe
              src={videoEmbedUrl}
              title={videoTitle}
              className="h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-background via-muted to-background text-muted-foreground">
            <Video className="h-12 w-12" />
            <p className="text-sm font-medium">{t("noVideoAvailable")}</p>
            {courseTrialVideoUrl && (
              <span className="text-xs text-muted-foreground">
                {t("addVideoUrl")}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export { getVimeoEmbedUrl };

