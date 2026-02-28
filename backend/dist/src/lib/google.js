import { OAuth2Client } from "google-auth-library";
import { env } from "./env.js";
const oauthClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
export async function verifyGoogleIdToken(idToken) {
    const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
        throw new Error("Google account heeft geen geverifieerd e-mailadres.");
    }
    return {
        email: payload.email,
        name: payload.name,
        imageUrl: payload.picture
    };
}
