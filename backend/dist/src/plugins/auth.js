import { prisma } from "../lib/prisma.js";
import { verifyAppToken } from "../lib/jwt.js";
import { env } from "../lib/env.js";
export async function requireAuth(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "Missing bearer token" });
    }
    const token = authHeader.slice("Bearer ".length);
    try {
        const payload = verifyAppToken(token);
        if (env.DEV_AUTH_BYPASS) {
            request.user = {
                id: payload.sub,
                email: payload.email,
                role: payload.role
            };
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, role: true }
        });
        if (!user) {
            return reply.code(401).send({ error: "Invalid session" });
        }
        request.user = user;
    }
    catch {
        return reply.code(401).send({ error: "Invalid token" });
    }
}
export function requireRole(role) {
    return async function roleGuard(request, reply) {
        if (!request.user) {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        if (request.user.role !== role) {
            return reply.code(403).send({ error: "Forbidden" });
        }
    };
}
