import type { VercelRequest, VercelResponse } from "@vercel/node";

let appPromise: Promise<any> | null = null;

async function getApp() {
  if (!appPromise) {
    // Dynamic import to handle ESM
    appPromise = import("../backend/src/app.js").then((mod) => mod.buildApp());
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await getApp();
  await app.ready();

  // Convert Vercel request to Fastify format
  const response = await app.inject({
    method: req.method as any,
    url: req.url,
    headers: req.headers as any,
    payload: req.body
  });

  // Set response headers
  for (const [key, value] of Object.entries(response.headers)) {
    if (value) {
      res.setHeader(key, value as string);
    }
  }

  res.status(response.statusCode).send(response.payload);
}
