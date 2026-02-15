import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { renderMarkdown } from "./MarkdownRenderer";
import type { Doc } from "../../../convex/_generated/dataModel";

type LessonDoc = Doc<"lessons">;

type LessonTabsProps = {
  activeLesson: LessonDoc | null;
  language: string;
  isRTL: boolean;
  t: (key: string) => string;
};

export const LessonTabs = ({
  activeLesson,
  language,
  isRTL,
  t,
}: LessonTabsProps) => {
  const overviewContent = activeLesson
    ? (language === "ar"
        ? (activeLesson.description_ar ?? activeLesson.short_review_ar ?? activeLesson.description ?? activeLesson.short_review)
        : (activeLesson.description ?? activeLesson.short_review))
    : undefined;

  const objectivesContent = activeLesson
    ? (language === "ar"
        ? (activeLesson.learning_objectives_ar ?? activeLesson.learning_objectives)
        : activeLesson.learning_objectives)
    : undefined;

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList
        className={cn(
          "flex w-full rounded-full bg-muted/60 p-1",
          isRTL && "flex-row-reverse"
        )}
      >
        <TabsTrigger value="overview" className="flex-1 rounded-full">
          {t("overview")}
        </TabsTrigger>
        <TabsTrigger value="objectives" className="flex-1 rounded-full">
          {t("learningObjectives")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <Card className="border-none bg-card/70 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>
              {t("lessonOverview")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderMarkdown(overviewContent, isRTL)}
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="objectives">
        <Card className="border-none bg-card/70 shadow-sm">
          <CardHeader>
            <CardTitle className={cn("text-lg font-semibold", isRTL ? "text-right" : "text-left")}>
              {t("learningObjectives")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {renderMarkdown(objectivesContent, isRTL)}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

