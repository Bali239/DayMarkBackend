import { createServer } from "node:http";
import dotenv from "dotenv";
import { OAuth2Client } from "google-auth-library";

dotenv.config({ path: new URL("../.env.local", import.meta.url) });

const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
const expectedSender = process.env.GMAIL_SENDER_EMAIL?.trim().toLowerCase();
const callbackPort = 53682;
const redirectUri = `http://localhost:${callbackPort}/oauth2callback`;

if (!clientId || !clientSecret || !expectedSender) {
  console.error(
    "Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_SENDER_EMAIL in server/.env.local first.",
  );
  process.exit(1);
}

const oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri);
const authorizationUrl = oauthClient.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  // The profile endpoint used below requires gmail.readonly in addition to
  // gmail.send. This lets the script verify the authorized sender account.
  scope: [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
});

const server = createServer(async (request, response) => {
  const callbackUrl = new URL(request.url || "/", redirectUri);
  if (callbackUrl.pathname !== "/oauth2callback") {
    response.writeHead(404).end("Not found");
    return;
  }

  const oauthError = callbackUrl.searchParams.get("error");
  const code = callbackUrl.searchParams.get("code");
  if (oauthError || !code) {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("Gmail authorization was not completed. You can close this tab.");
    console.error(`Gmail authorization failed (${oauthError || "missing_code"}).`);
    server.close();
    return;
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("No refresh token was returned. Revoke this app's access and authorize again.");
    }
    oauthClient.setCredentials(tokens);
    const profile = await oauthClient.request({
      url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      method: "GET",
    });
    const authorizedSender = profile.data?.emailAddress?.toLowerCase();
    if (authorizedSender !== expectedSender) {
      throw new Error("The authorized Google account does not match GMAIL_SENDER_EMAIL.");
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end("Gmail sender authorized. You can close this tab and return to the terminal.");
    console.log(`Gmail account authorized: ${authorizedSender}`);
    console.log("Copy this refresh token to GMAIL_REFRESH_TOKEN in your private environment:");
    console.log(tokens.refresh_token);
    console.log("Do not commit or share this token.");
    server.close();
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("Gmail authorization failed. Check the server terminal for details.");
    console.error(error.message || "Gmail authorization failed.");
    server.close();
    process.exitCode = 1;
  }
});

server.on("error", (error) => {
  console.error(`Could not start the local OAuth callback server (${error.code || error.name}).`);
  process.exitCode = 1;
});

server.listen(callbackPort, "127.0.0.1", () => {
  console.log("Open this URL and authorize the Gmail sender account:");
  console.log(authorizationUrl);
  console.log(`Waiting for the OAuth callback at ${redirectUri}`);
});
