import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  Activity,
  ArrowLeft,
  Award,
  Clock,
  Eye,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { api } from "../../convex/_generated/api";
import {
  MAX_CONTENT_ANALYTICS_RANGE_DAYS,
  defaultContentAnalyticsEndDate,
  defaultContentAnalyticsStartDate,
} from "../../convex/lib/viewPeriodKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(45 93% 47%)",
  "hsl(25 95% 53%)",
  "hsl(330 81% 60%)",
  "hsl(142 71% 45%)",
  "hsl(215 16% 65%)",
  "hsl(262 83% 58%)",
  "hsl(173 80% 40%)",
];

const viewsChartConfig = {
  views: {
    label: "Views",
    color: "hsl(221 83% 53%)",
  },
} satisfies ChartConfig;

type KpiCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  iconClassName: string;
  trend?: {
    value: number;
    label: string;
  };
};

type BreakdownSlice = {
  key: string;
  name: string;
  count: number;
  percentage: number;
  fill: string;
  detail?: string;
};

const formatShortDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const formatDateLabel = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

const formatHours = (hours: number) => {
  if (hours < 0.01) return "0h";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;
};

const KpiCard = ({
  title,
  value,
  subtitle,
  icon,
  iconClassName,
  trend,
}: KpiCardProps) => (
  <div className="rounded-xl border bg-card p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          iconClassName,
        )}
      >
        {icon}
      </div>
    </div>
    <p className="mt-4 text-sm text-muted-foreground">{title}</p>
    <p className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight">
      {value}
    </p>
    {trend ? (
      <div className="mt-3 flex items-center gap-1.5 text-sm">
        {trend.value >= 0 ? (
          <TrendingUp className="h-4 w-4 text-emerald-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-rose-600" />
        )}
        <span
          className={cn(
            "font-medium",
            trend.value >= 0 ? "text-emerald-600" : "text-rose-600",
          )}
        >
          {trend.value >= 0 ? "+" : ""}
          {trend.value.toLocaleString()}%
        </span>
        <span className="text-muted-foreground">{trend.label}</span>
      </div>
    ) : (
      <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
    )}
  </div>
);

const BreakdownPieCard = ({
  title,
  badge,
  emptyMessage,
  total,
  data,
  valueSuffix = "",
}: {
  title: string;
  badge: string;
  emptyMessage: string;
  total: number;
  data: BreakdownSlice[];
  valueSuffix?: string;
}) => (
  <div className="overflow-hidden rounded-xl border bg-card p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="font-medium">{title}</h3>
      <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
        {badge}
      </span>
    </div>
    {data.length === 0 ? (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    ) : (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)] lg:items-center">
        <div className="relative mx-auto h-[220px] w-[220px] shrink-0">
          <ChartContainer config={{}} className="h-full w-full">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                innerRadius={62}
                outerRadius={92}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-semibold">
              {total.toLocaleString()}
              {valueSuffix}
            </span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3">
          {data.map((item) => (
            <div
              key={item.key}
              className="flex min-w-0 items-center justify-between gap-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border"
                  style={{ backgroundColor: item.fill }}
                />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate" title={item.name}>
                    {item.name}
                  </span>
                  {item.detail ? (
                    <span
                      className="block truncate text-xs text-muted-foreground"
                      title={item.detail}
                    >
                      {item.detail}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right text-muted-foreground">
                <span className="font-medium text-foreground">
                  {item.percentage.toLocaleString()}%
                </span>
                <span className="ml-2">
                  ({item.count.toLocaleString()}
                  {valueSuffix})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ContentAnalytics = () => {
  const [startDate, setStartDate] = useState(() =>
    defaultContentAnalyticsStartDate(30),
  );
  const [endDate, setEndDate] = useState(() => defaultContentAnalyticsEndDate());

  const analytics = useQuery(api.contentViews.getContentEngagementDashboard, {
    startDate,
    endDate,
  });

  const lineChartData = useMemo(
    () =>
      analytics?.viewsByDay.map((day) => ({
        ...day,
        label: formatShortDate(day.date),
      })) ?? [],
    [analytics?.viewsByDay],
  );

  const courseViewsDonut = useMemo(() => {
    if (!analytics?.topCoursesByViews.length) return [];
    return analytics.topCoursesByViews.map((item, index) => ({
      key: item.id,
      name: item.name,
      count: item.count,
      percentage: item.percentage,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [analytics?.topCoursesByViews]);

  const lessonViewsDonut = useMemo(() => {
    if (!analytics?.topLessonsByViews.length) return [];
    return analytics.topLessonsByViews.map((item, index) => ({
      key: item.id,
      name: item.name,
      count: item.count,
      percentage: item.percentage,
      fill: CHART_COLORS[index % CHART_COLORS.length],
      detail: item.courseName,
    }));
  }, [analytics?.topLessonsByViews]);

  const courseWatchDonut = useMemo(() => {
    if (!analytics?.topCoursesByWatched.length) return [];
    return analytics.topCoursesByWatched.map((item, index) => ({
      key: item.id,
      name: item.name,
      count: Math.round((item.count / 3600) * 10) / 10,
      percentage: item.percentage,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));
  }, [analytics?.topCoursesByWatched]);

  const previousPeriodLabel = analytics
    ? `vs ${formatShortDate(analytics.previousPeriod.startDate)} – ${formatDateLabel(analytics.previousPeriod.endDate)}`
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link to="/courses">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to courses
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            Content analytics
          </h1>
          <p className="mt-2 text-muted-foreground">
            Course and lesson views · watched hours from lesson completions · UTC
            · max {MAX_CONTENT_ANALYTICS_RANGE_DAYS} days
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-medium">Engagement overview</h2>
            <p className="text-sm text-muted-foreground">
              Views counted once per user per lesson per UTC day
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:w-[28rem]">
            <div className="space-y-2">
              <Label htmlFor="content-analytics-start">Start date</Label>
              <Input
                id="content-analytics-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content-analytics-end">End date</Label>
              <Input
                id="content-analytics-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {analytics === undefined ? (
        <p className="text-muted-foreground">Loading analytics…</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title="Total views"
              value={analytics.totalViews.toLocaleString()}
              subtitle=""
              icon={<Eye className="h-5 w-5 text-sky-600" />}
              iconClassName="bg-sky-100"
              trend={{
                value: analytics.viewsChangePercent,
                label: previousPeriodLabel,
              }}
            />
            <KpiCard
              title="Watched hours"
              value={formatHours(analytics.totalWatchedHours)}
              subtitle="From completed lessons"
              icon={<Clock className="h-5 w-5 text-violet-600" />}
              iconClassName="bg-violet-100"
            />
            <KpiCard
              title="Top course"
              value={analytics.topCourse?.name ?? "—"}
              subtitle={
                analytics.topCourse
                  ? `${analytics.topCourse.views.toLocaleString()} views`
                  : "No views yet"
              }
              icon={<Award className="h-5 w-5 text-emerald-600" />}
              iconClassName="bg-emerald-100"
            />
            <KpiCard
              title="Top lesson"
              value={analytics.topLesson?.name ?? "—"}
              subtitle={
                analytics.topLesson
                  ? `${analytics.topLesson.views.toLocaleString()} views`
                  : "No views yet"
              }
              icon={<Activity className="h-5 w-5 text-rose-600" />}
              iconClassName="bg-rose-100"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-medium">Views over time</h3>
                <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
                  Daily
                </span>
              </div>
              {lineChartData.every((day) => day.views === 0) ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No views in this date range.
                </p>
              ) : (
                <ChartContainer
                  config={viewsChartConfig}
                  className="aspect-auto h-[200px] w-full"
                >
                  <AreaChart
                    data={lineChartData}
                    margin={{ left: 0, right: 8, top: 8 }}
                  >
                    <defs>
                      <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="hsl(221 83% 53%)"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="hsl(221 83% 53%)"
                          stopOpacity={0.03}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) =>
                            payload?.[0]?.payload?.date
                              ? formatDateLabel(payload[0].payload.date)
                              : ""
                          }
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="hsl(221 83% 53%)"
                      strokeWidth={2}
                      fill="url(#viewsFill)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>

            <BreakdownPieCard
              title="Top courses by views"
              badge="By course"
              emptyMessage="No course views in this date range."
              total={analytics.totalViews}
              data={courseViewsDonut}
            />
            <BreakdownPieCard
              title="Top lessons by views"
              badge="By lesson"
              emptyMessage="No lesson views in this date range."
              total={analytics.totalViews}
              data={lessonViewsDonut}
            />
            <BreakdownPieCard
              title="Top courses by watched hours"
              badge="Completions"
              emptyMessage="No watched hours in this date range."
              total={
                Math.round((analytics.totalWatchedSeconds / 3600) * 10) / 10
              }
              data={courseWatchDonut}
              valueSuffix="h"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ContentAnalytics;
