import { defineApp } from "convex/server";

import actionRetrier from "@convex-dev/action-retrier/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();

app.use(actionRetrier);

app.use(aggregate, { name: "aggregateCategories" });


export default app;