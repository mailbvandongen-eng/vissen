import { buildApp } from "./app.js";
import { env } from "./lib/env.js";

const app = await buildApp();
const port = Number(env.PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
