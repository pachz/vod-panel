import { defineApp } from "convex/server";

import actionRetrier from "@convex-dev/action-retrier/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp();

app.use(actionRetrier);

app.use(aggregate, { name: "aggregateCategories" });
app.use(aggregate, { name: "aggregateLessonWatched" });
app.use(aggregate, { name: "aggregateCourseWatched" });

app.use(migrations);

export default app;