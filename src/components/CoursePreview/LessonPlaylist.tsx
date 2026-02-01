import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LessonPlaylistItem } from "./LessonPlaylistItem";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type CourseProgress = {
  completedLessonIds: string[];
  completedCount: number;
  lastCompletedAt: number | null;
};

type LessonPlaylistProps = {
  lessons: LessonDoc[];
  activeLessonId: string | null;
  completedLessonIds: Set<string>;
  progressData: CourseProgress;
  totalLessons: number;
  language: string;
  isRTL: boolean;
  t: (key: string) => string;
  formatDuration: (seconds: number | undefined | null) => string;
  onLessonClick: (lessonId: string) => void;
  buttonsSectionRef: React.RefObject<HTMLDivElement>;
  activeLessonRef: React.RefObject<HTMLButtonElement>;
};

export const LessonPlaylist = ({
  lessons,
  activeLessonId,
  completedLessonIds,
  progressData,
  totalLessons,
  language,
  isRTL,
  t,
  formatDuration,
  onLessonClick,
  buttonsSectionRef,
  activeLessonRef,
}: LessonPlaylistProps) => {
  const playlistCardRef = useRef<HTMLDivElement>(null);
  const playlistScrollRef = useRef<HTMLDivElement>(null);
  const [playlistCardHeight, setPlaylistCardHeight] = useState<string | undefined>(undefined);

  // Match playlist height to video + buttons section
  useEffect(() => {
    const updatePlaylistHeight = () => {
      if (buttonsSectionRef.current && playlistCardRef.current && playlistScrollRef.current) {
        const buttonsRect = buttonsSectionRef.current.getBoundingClientRect();
        const buttonsBottom = buttonsRect.bottom;

        const cardRect = playlistCardRef.current.getBoundingClientRect();
        const cardTop = cardRect.top;

        const totalCardHeight = buttonsBottom - cardTop;
        setPlaylistCardHeight(`${totalCardHeight}px`);
      }
    };

    const rafId = requestAnimationFrame(() => {
      setTimeout(updatePlaylistHeight, 10);
    });

    window.addEventListener('resize', updatePlaylistHeight);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePlaylistHeight);
    };
  }, [lessons, activeLessonId, buttonsSectionRef]);

  // Scroll to active lesson in playlist
  useEffect(() => {
    if (activeLessonRef.current && playlistScrollRef.current) {
      const scrollContainer = playlistScrollRef.current;
      const activeButton = activeLessonRef.current;

      const containerRect = scrollContainer.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();

      const scrollTop = scrollContainer.scrollTop;
      const buttonTop = buttonRect.top - containerRect.top + scrollTop;
      const containerHeight = scrollContainer.clientHeight;

      const targetScroll = buttonTop - (containerHeight / 2) + (buttonRect.height / 2);

      scrollContainer.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, [activeLessonId, lessons, activeLessonRef]);

  return (
    <Card
      ref={playlistCardRef}
      className="border border-border/60 dark:border-transparent bg-card/70 shadow-sm flex flex-col"
      style={{ height: playlistCardHeight }}
    >
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className={cn(isRTL ? "text-right" : "text-left")}>
            <p className={cn("text-sm font-semibold text-muted-foreground", isRTL ? "text-right" : "text-left")}>
              {t("courseLessons")}
            </p>
            <CardTitle className={cn("text-xl", isRTL ? "text-right" : "text-left")}>
              {t("lessonPlaylist")}
            </CardTitle>
          </div>
          <Badge variant="outline">
            {progressData.completedCount}/{totalLessons} {t("done")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent
        ref={playlistScrollRef}
        className="space-y-3 overflow-y-auto flex-1 min-h-0"
        style={{
          scrollBehavior: 'smooth',
        }}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("publishLessons")}
          </div>
        ) : (
          lessons.map((lesson, index) => {
            const isActive = activeLessonId === lesson._id;
            const isCompleted = completedLessonIds.has(lesson._id);
            const lessonTitle = language === "ar" ? lesson.title_ar : lesson.title;

            return (
              <LessonPlaylistItem
                key={`${lesson._id}-${index}`}
                ref={isActive ? activeLessonRef : null}
                lesson={lesson}
                index={index}
                isActive={isActive}
                isCompleted={isCompleted}
                lessonTitle={lessonTitle}
                duration={lesson.duration}
                onClick={() => onLessonClick(lesson._id)}
                isRTL={isRTL}
                t={t}
                formatDuration={formatDuration}
              />
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

