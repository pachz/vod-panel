import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderTree, BookOpen, GraduationCap, TrendingUp } from "lucide-react";

const stats = [
  {
    title: "Total Categories",
    value: "12",
    icon: FolderTree,
    trend: "+2 this month",
    color: "from-primary to-primary-glow",
  },
  {
    title: "Active Courses",
    value: "48",
    icon: BookOpen,
    trend: "+8 this month",
    color: "from-primary to-primary-glow",
  },
  {
    title: "Total Lessons",
    value: "324",
    icon: GraduationCap,
    trend: "+24 this week",
    color: "from-primary to-primary-glow",
  },
  {
    title: "Growth Rate",
    value: "23%",
    icon: TrendingUp,
    trend: "+5% from last month",
    color: "from-cta to-cta-glow",
  },
];

const Dashboard = () => {
  return (
    <div className="relative z-10 space-y-12 py-4">
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-lg">
          Welcome back! Here's an overview of your learning platform.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="card-elevated group hover:scale-105 transition-transform duration-300">
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <div className={`mx-auto h-16 w-16 icon-badge bg-gradient-to-br ${stat.color}`}>
                <stat.icon className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.title}
                </p>
                <div className="text-4xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.trend}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="card-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { action: "New course added", course: "Advanced React Patterns", time: "2 hours ago" },
                { action: "Lesson updated", course: "JavaScript Fundamentals", time: "5 hours ago" },
                { action: "Category created", course: "Data Science", time: "1 day ago" },
              ].map((activity, i) => (
                <div key={i} className="flex items-start gap-4 pb-6 border-b border-border/50 last:border-0 last:pb-0">
                  <div className="h-3 w-3 rounded-full bg-gradient-to-br from-primary to-primary-glow mt-1 shadow-md shadow-primary/50" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-semibold">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">{activity.course}</p>
                    <p className="text-xs text-muted-foreground/80">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">Popular Courses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { name: "Web Development Masterclass", students: 1234, progress: 85 },
                { name: "UI/UX Design Fundamentals", students: 892, progress: 72 },
                { name: "Python for Data Science", students: 756, progress: 68 },
              ].map((course, i) => (
                <div key={i} className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <p className="text-sm font-semibold leading-tight">{course.name}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{course.students} students</span>
                  </div>
                  <div className="relative h-2.5 bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-cta to-cta-glow rounded-full shadow-md"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
