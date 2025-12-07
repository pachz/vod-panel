import { useMemo } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { BookOpen, CheckCircle2, Clock, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

const UserDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, t, isRTL } = useLanguage();

  const currentUser = useQuery(api.user.getCurrentUser);
  const stats = useQuery(api.lessonProgress.getUserDashboardStats);
  const userCourses = useQuery(api.lessonProgress.getUserCourses);

  const isLoading = stats === undefined || userCourses === undefined;

  // Redirect admin users to their dashboard
  if (currentUser === undefined) {
    // Still loading user data, show loading
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir={isRTL ? "rtl" : "ltr"}>
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (currentUser?.isGod) {
    return <Navigate to="/dashboard" replace />;
  }

  const coursesInProgress = useMemo(
    () => userCourses?.filter((c) => !c.isCompleted) ?? [],
    [userCourses]
  );

  const coursesCompleted = useMemo(
    () => userCourses?.filter((c) => c.isCompleted) ?? [],
    [userCourses]
  );

  const hasNoCourses = !isLoading && userCourses && userCourses.length === 0;

  // Show loading state while data is being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir={isRTL ? "rtl" : "ltr"}>
        <div className="text-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const statsData = [
    {
      title: t("coursesCompleted"),
      value: stats?.coursesCompleted ?? 0,
      icon: CheckCircle2,
      color: "from-green-500 to-green-600",
    },
    {
      title: t("inProgress"),
      value: stats?.coursesInProgress ?? 0,
      icon: BookOpen,
      color: "from-blue-500 to-blue-600",
    },
    {
      title: t("hoursWatched"),
      value: stats?.hoursWatched ?? 0,
      icon: Clock,
      color: "from-purple-500 to-purple-600",
    },
    {
      title: t("memberSince"),
      value: stats?.memberSince
        ? formatDate(stats.memberSince)
        : "—",
      icon: Calendar,
      color: "from-orange-500 to-orange-600",
    },
  ];

  // Show empty state if user has no courses (after loading is complete)
  if (hasNoCourses) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir={isRTL ? "rtl" : "ltr"}>
        <div className="max-w-md w-full px-6 text-center space-y-8">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full blur-2xl" />
              <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Sparkles className="h-12 w-12 text-white" />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">{t("getStarted")}</h2>
            <h3 className="text-xl text-muted-foreground">{t("noCoursesYet")}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {t("getStartedDescription")}
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => {
              const searchParams = new URLSearchParams(location.search);
              if (language === "ar") {
                searchParams.set("lang", "ar");
              } else {
                searchParams.delete("lang");
              }
              const queryString = searchParams.toString();
              navigate(`/courses/card${queryString ? `?${queryString}` : ""}`);
            }}
            className="w-full sm:w-auto px-8 rounded-lg bg-pink-500 text-white hover:bg-pink-600"
          >
            {t("browseCourses")}
            <ArrowRight className={cn("h-5 w-5", isRTL ? "mr-2 rotate-180" : "ml-2")} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" dir={isRTL ? "rtl" : "ltr"}>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
        <p className="text-muted-foreground">{t("welcomeBack")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsData.map((stat) => (
          <Card key={stat.title} className="card-elevated group hover:scale-105 transition-transform duration-300">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </p>
                <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-2xl">{t("myCourses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="in-progress" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in-progress">
                {t("inProgressTab")} ({coursesInProgress.length})
              </TabsTrigger>
              <TabsTrigger value="completed">
                {t("completedTab")} ({coursesCompleted.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="in-progress" className="space-y-4 mt-6">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Loading...
                </div>
              ) : coursesInProgress.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("noCoursesInProgress")}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {t("startLearning")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {coursesInProgress.map(({ course, completedCount, totalLessons, progressPercentage }) => {
                    const courseName = language === "ar" ? course.name_ar : course.name;
                    return (
                      <Card key={course._id} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <h3 className="font-semibold text-lg leading-tight">
                                  {courseName}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  {completedCount} {t("of")} {totalLessons} {t("lessonsCompleted")}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/courses/preview/${course._id}`)}
                                className="shrink-0"
                              >
                                {t("viewCourse")}
                                <ArrowRight className={cn("ml-2 h-4 w-4", isRTL && "ml-0 mr-2 rotate-180")} />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{Math.round(progressPercentage)}%</span>
                                <span>{completedCount} / {totalLessons}</span>
                              </div>
                              <Progress value={progressPercentage} className="h-2" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
            <TabsContent value="completed" className="space-y-4 mt-6">
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Loading...
                </div>
              ) : coursesCompleted.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {t("noCoursesCompleted")}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {t("startLearning")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {coursesCompleted.map(({ course, completedCount, totalLessons, progressPercentage }) => {
                    const courseName = language === "ar" ? course.name_ar : course.name;
                    return (
                      <Card key={course._id} className="hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-lg leading-tight">
                                    {courseName}
                                  </h3>
                                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {completedCount} {t("of")} {totalLessons} {t("lessonsCompleted")}
                                </p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(`/courses/preview/${course._id}`)}
                                className="shrink-0"
                              >
                                {t("viewCourse")}
                                <ArrowRight className={cn("ml-2 h-4 w-4", isRTL && "ml-0 mr-2 rotate-180")} />
                              </Button>
                            </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{Math.round(progressPercentage)}%</span>
                                <span>{completedCount} / {totalLessons}</span>
                              </div>
                              <Progress value={progressPercentage} className="h-2" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default UserDashboard;

