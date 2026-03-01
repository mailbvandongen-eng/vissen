import Fastify from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { env } from "./lib/env.js";
import { verifyGoogleIdToken } from "./lib/google.js";
import { prisma } from "./lib/prisma.js";
import { signAppToken } from "./lib/jwt.js";
import { requireAuth, requireRole } from "./plugins/auth.js";
import {
  importPickerSelection,
  listPhotos,
  speciesDashboard,
  updatePhotoSpecies
} from "./modules/photo-store.js";
import {
  createPickerSession,
  getPickerSession,
  listPickerMediaItems
} from "./modules/google-photos-picker.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  const allowedOrigins = new Set<string>([
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
  ]);

  if (env.FRONTEND_ORIGIN) {
    allowedOrigins.add(env.FRONTEND_ORIGIN);
  }

  // For Vercel, allow the deployment URL
  if (process.env.VERCEL_URL) {
    allowedOrigins.add(`https://${process.env.VERCEL_URL}`);
  }

  await app.register(cors, {
    origin(origin, cb) {
      // Allow requests with no origin (mobile apps, curl, etc)
      if (!origin) {
        cb(null, true);
        return;
      }
      // Allow Vercel preview deployments
      if (origin.endsWith(".vercel.app") || allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    }
  });

  function getErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return "Unknown error";
  }

  app.get("/api/health", async () => {
    return { ok: true };
  });

  app.post("/api/auth/dev-login", async (request, reply) => {
    if (!env.DEV_AUTH_BYPASS) {
      return reply.code(403).send({ error: "Dev login disabled" });
    }

    const user = await prisma.user.upsert({
      where: { email: "dev@visapp.local" },
      update: {},
      create: {
        email: "dev@visapp.local",
        name: "Dev User",
        role: "ADMIN"
      }
    });

    const token = signAppToken({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    };
  });

  const googleAuthBodySchema = z.object({
    idToken: z.string().min(1)
  });

  const importPickerBodySchema = z.object({
    accessToken: z.string().min(1),
    items: z
      .array(
        z.object({
          sourceItemId: z.string().min(1),
          imageUrl: z.string().url(),
          thumbnailUrl: z.string().url().optional(),
          takenAt: z.string().datetime(),
          lat: z.number(),
          lon: z.number(),
          locationName: z.string().optional(),
          species: z.enum(["Snoek", "Baars", "Karper", "Snoekbaars"]).optional()
        })
      )
      .min(1)
  });

  const speciesBodySchema = z.object({
    species: z.enum(["Snoek", "Baars", "Karper", "Snoekbaars"])
  });

  const pickerAuthBodySchema = z.object({
    accessToken: z.string().min(1)
  });

  const pickerCreateSessionBodySchema = pickerAuthBodySchema.extend({
    maxItemCount: z.number().int().positive().max(150).optional()
  });

  const pickerMediaItemsBodySchema = pickerAuthBodySchema.extend({
    pageToken: z.string().optional()
  });

  app.post("/api/auth/google/callback", async (request, reply) => {
    const parseResult = googleAuthBodySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    try {
      const googleIdentity = await verifyGoogleIdToken(parseResult.data.idToken);

      const user = await prisma.user.upsert({
        where: { email: googleIdentity.email },
        update: {
          name: googleIdentity.name,
          imageUrl: googleIdentity.imageUrl
        },
        create: {
          email: googleIdentity.email,
          name: googleIdentity.name,
          imageUrl: googleIdentity.imageUrl
        }
      });

      const token = signAppToken({
        sub: user.id,
        email: user.email,
        role: user.role
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          imageUrl: user.imageUrl,
          role: user.role
        }
      };
    } catch (error) {
      request.log.error({ error }, "Google auth failed");
      return reply.code(401).send({ error: `Google login failed: ${getErrorMessage(error)}` });
    }
  });

  app.get("/api/auth/me", { preHandler: [requireAuth] }, async (request) => {
    return { user: request.user };
  });

  app.get("/api/auth/admin-check", { preHandler: [requireAuth, requireRole("ADMIN")] }, async () => {
    return { ok: true };
  });

  app.post("/api/photos/import-picker-selection", { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = importPickerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const imported = await importPickerSelection(
      request.user!.id,
      request.user!.email,
      parsed.data.items,
      parsed.data.accessToken
    );
    return { importedCount: imported.length, photos: imported };
  });

  app.get("/api/photos", { preHandler: [requireAuth] }, async (request) => {
    const query = z
      .object({
        species: z.string().optional()
      })
      .parse(request.query);

    const photos = await listPhotos(query.species);
    return { photos };
  });

  app.post("/api/photos/:id/species", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = speciesBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const updated = await updatePhotoSpecies(params.id, body.data.species);
    if (!updated) {
      return reply.code(404).send({ error: "Photo not found" });
    }
    return { photo: updated };
  });

  app.get("/api/dashboard/species/:name", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ name: z.string().min(1) }).parse(request.params);
    const dashboard = await speciesDashboard(params.name);
    return dashboard;
  });

  app.post("/api/picker/sessions", { preHandler: [requireAuth] }, async (request, reply) => {
    const body = pickerCreateSessionBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    try {
      const session = await createPickerSession(body.data.accessToken, body.data.maxItemCount);
      return session;
    } catch (error) {
      request.log.error({ error }, "Failed to create picker session");
      return reply.code(502).send({ error: `Failed to create picker session: ${getErrorMessage(error)}` });
    }
  });

  app.post("/api/picker/sessions/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = pickerAuthBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    try {
      const session = await getPickerSession(body.data.accessToken, params.id);
      return session;
    } catch (error) {
      request.log.error({ error }, "Failed to fetch picker session");
      return reply.code(502).send({ error: `Failed to fetch picker session: ${getErrorMessage(error)}` });
    }
  });

  app.post("/api/picker/sessions/:id/media-items", { preHandler: [requireAuth] }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = pickerMediaItemsBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    try {
      const result = await listPickerMediaItems(body.data.accessToken, params.id, body.data.pageToken);
      return result;
    } catch (error) {
      request.log.error({ error }, "Failed to list picker media items");
      return reply.code(502).send({ error: `Failed to list picker media items: ${getErrorMessage(error)}` });
    }
  });

  return app;
}
