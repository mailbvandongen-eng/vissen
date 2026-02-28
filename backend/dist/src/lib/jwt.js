import jwt from "jsonwebtoken";
import { env } from "./env.js";
export function signAppToken(payload) {
    return jwt.sign(payload, env.APP_JWT_SECRET, { expiresIn: "7d" });
}
export function verifyAppToken(token) {
    return jwt.verify(token, env.APP_JWT_SECRET);
}
