import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ensureSeedAccount } from "./seed";

const http = httpRouter();

auth.addHttpRoutes(http);
http.route({
  path: "/internal/seed/pach71",
  method: "GET",
  handler: ensureSeedAccount,
});

export default http;