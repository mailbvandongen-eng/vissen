import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    APP_JWT_SECRET: z.string().min(24),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    FRONTEND_ORIGIN: z.string().url().optional(),
    DEV_AUTH_BYPASS: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => value === "true"),
    PORT: z.string().optional()
});
export const env = envSchema.parse(process.env);
