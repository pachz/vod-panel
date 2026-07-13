import { defineApp } from "convex/server";

import actionRetrier from "@convex-dev/action-retrier/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config.js";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();

app.use(agent);
app.use(actionRetrier);

app.use(aggregate, { name: "aggregateCategories" });
app.use(aggregate, { name: "aggregateLessonWatched" });
app.use(aggregate, { name: "aggregateCourseWatched" });
app.use(aggregate, { name: "aggregatePersonalTestAttemptStarts" });
app.use(aggregate, { name: "aggregatePersonalTestAttemptCompletions" });
app.use(aggregate, { name: "aggregatePersonalTestCourseRecommendations" });

app.use(migrations);

export default app;