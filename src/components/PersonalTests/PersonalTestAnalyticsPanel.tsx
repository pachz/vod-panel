import { useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  Award,
  Package,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import {
  formatAnalyticsDateLabel,
  formatAnalyticsShortDate,
  MAX_ANALYTICS_RANGE_DAYS,
  ANALYTICS_TIMEZONE,
} from "../../../shared/validation/personalTestAnalytics";

const COURSE_CHART_COLORS = [
  "hsl(221 83% 53%)",
  "hsl(45 93% 47%)",
  "hsl(25 95% 53%)",
  "hsl(330 81% 60%)",
  "hsl(142 71% 45%)",
  "hsl(215 16% 65%)",
];

const attemptsChartConfig = {
  attempts: {
    label: "Attempts",
    color: "hsl(330 81% 60%)",
  },
} satisfies ChartConfig;

type PersonalTestAnalyticsPanelProps = {
  testId: Id<"personalTests">;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

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
    <p className="mt-1 line-clamp-2 text-2xl font-semibold tracking-tight">{value}</p>
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

export const PersonalTestAnalyticsPanel = ({
  testId,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: PersonalTestAnalyticsPanelProps) => {
  const analytics = useQuery(api.personalTestAttemptAnalytics.getPersonalTestAttemptAnalytics, {
    testId,
    startDate,
    endDate,
  });

  const lineChartData = useMemo(
    () =>
      analytics?.attemptsByDay.map((day) => ({
        ...day,
        label: formatAnalyticsShortDate(day.date),
      })) ?? [],
    [analytics?.attemptsByDay],
  );

  const donutData = useMemo(() => {
    if (!analytics?.courseBreakdown.length) {
      return [];
    }

    return analytics.courseBreakdown.map((item, index) => ({
      ...item,
      fill: COURSE_CHART_COLORS[index % COURSE_CHART_COLORS.length],
      key: item.courseId ?? "other",
    }));
  }, [analytics?.courseBreakdown]);

  const previousPeriodLabel = analytics
    ? `vs ${formatAnalyticsShortDate(analytics.previousPeriod.startDate)} – ${formatAnalyticsDateLabel(analytics.previousPeriod.endDate)}`
    : "";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-medium">Attempt analytics</h2>
            <p className="text-sm text-muted-foreground">
              Kuwait time ({ANALYTICS_TIMEZONE}) · preview attempts excluded · max{" "}
              {MAX_ANALYTICS_RANGE_DAYS} days
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:w-[28rem]">
            <div className="space-y-2">
              <Label htmlFor="analytics-start">Start date</Label>
              <Input
                id="analytics-start"
                type="date"
                value={startDate}
                onChange={(e) => onStartDateChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-end">End date</Label>
              <Input
                id="analytics-end"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
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
              title="Total test attempts"
              value={analytics.totalAttempts.toLocaleString()}
              subtitle=""
              icon={<Activity className="h-5 w-5 text-rose-600" />}
              iconClassName="bg-rose-100"
              trend={{
                value: analytics.attemptsChangePercent,
                label: previousPeriodLabel,
              }}
            />
            <KpiCard
              title="Completed tests"
              value={analytics.completedAttempts.toLocaleString()}
              subtitle={`${analytics.completionRate.toLocaleString()}% completion rate`}
              icon={<Users className="h-5 w-5 text-violet-600" />}
              iconClassName="bg-violet-100"
            />
            <KpiCard
              title="Courses recommended"
              value={analytics.totalRecommendations.toLocaleString()}
              subtitle="Total course suggestions"
              icon={<Package className="h-5 w-5 text-orange-600" />}
              iconClassName="bg-orange-100"
            />
            <KpiCard
              title="Top course"
              value={analytics.topCourse?.name ?? "—"}
              subtitle={
                analytics.topCourse
                  ? "Most recommended course"
                  : "No recommendations yet"
              }
              icon={<Award className="h-5 w-5 text-emerald-600" />}
              iconClassName="bg-emerald-100"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-medium">Test attempts over time</h3>
                <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
                  Daily
                </span>
              </div>
              {lineChartData.every((day) => day.attempts === 0) ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No attempts in this date range.
                </p>
              ) : (
                <ChartContainer
                  config={attemptsChartConfig}
                  className="aspect-[16/9] w-full"
                >
                  <AreaChart data={lineChartData} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="attemptsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(330 81% 60%)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(330 81% 60%)" stopOpacity={0.03} />
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
                              ? formatAnalyticsDateLabel(payload[0].payload.date)
                              : ""
                          }
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="attempts"
                      stroke="hsl(330 81% 60%)"
                      strokeWidth={2}
                      fill="url(#attemptsFill)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-medium">Top recommended courses</h3>
                <span className="rounded-md border px-2.5 py-1 text-xs text-muted-foreground">
                  By course
                </span>
              </div>
              {donutData.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  No course recommendations in this date range.
                </p>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr] lg:items-center">
                  <div className="relative mx-auto h-[220px] w-[220px]">
                    <ChartContainer config={{}} className="h-full w-full">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="count"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={92}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {donutData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-semibold">
                        {analytics.totalRecommendations.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground">Total</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {donutData.map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.fill }}
                          />
                          <span className="truncate">{item.name}</span>
                        </div>
                        <div className="shrink-0 text-right text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {item.percentage.toLocaleString()}%
                          </span>
                          <span className="ml-2">({item.count.toLocaleString()})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
