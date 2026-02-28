import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AppJwtPayload = {
  sub: string;
  email: string;
  role: "MEMBER" | "ADMIN";
};

export function signAppToken(payload: AppJwtPayload) {
  return jwt.sign(payload, env.APP_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAppToken(token: string) {
  return jwt.verify(token, env.APP_JWT_SECRET) as AppJwtPayload;
}

