# Render email and push configuration

## Gmail API email sender

The backend sends reminder email through the Gmail API over HTTPS. It does not use SMTP, which avoids Render Free's blocked SMTP ports.

A Google Cloud API key by itself cannot send mail from Gmail. Gmail sending accesses a user's mailbox, so the API requires OAuth authorization for the sender account. The backend intentionally does not send or log `GMAIL_API_KEY`; configure the OAuth client and refresh token below instead. [Google Workspace authentication guidance](https://developers.google.com/workspace/guides/auth-overview), [Gmail send authorization](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)

1. In [Google Cloud Console](https://console.cloud.google.com/), select the **Reminder App** project. Go to **APIs & Services → Library**, search for **Gmail API**, open it, and click **Enable**.
2. Open **Google Auth Platform → Branding** and complete the app name and support email. Under **Audience**, choose **External** for a personal Gmail account, then add that Gmail address under **Test users**. Under **Data Access**, add these scopes: `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`. The script uses `gmail.readonly` to verify the authorized sender address against `GMAIL_SENDER_EMAIL`.
3. Under **Google Auth Platform → Clients**, click **Create Client → Web application**. Add this exact URI under **Authorized redirect URIs**:

   ```text
   http://localhost:53682/oauth2callback
   ```

   Create the client. Its details page provides the **Client ID** and **Client secret**. This is a separate client from the one used for Daymark sign-in.
4. In `server/.env.local`, enter the client ID, client secret, and the exact Gmail address that will send reminders:

   ```dotenv
   GMAIL_OAUTH_CLIENT_ID=...
   GMAIL_OAUTH_CLIENT_SECRET=...
   GMAIL_SENDER_EMAIL=sender@gmail.com
   ```

5. In a terminal, run `cd server` then `npm run auth:gmail`. Open the printed URL, sign in as the same address as `GMAIL_SENDER_EMAIL`, and approve Gmail sending. If Google shows an unverified-app warning during testing, continue only if the sender address is listed as a test user. The script checks the account and prints `GMAIL_REFRESH_TOKEN`; copy it into `server/.env.local`.
6. In Render, open the backend service's **Environment** settings and add all four values: `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_SENDER_EMAIL`. Save and redeploy. The startup log should show `emailEnabled: true`.

Keep the client secret and refresh token private: do not paste them into chat, commit them, or add them to Vercel/`NEXT_PUBLIC_*`. `GMAIL_API_KEY` is not used and can be removed; it cannot replace the OAuth values above.

Google classifies `gmail.send` as a sensitive OAuth scope. For an external consent screen left in Testing, refresh tokens for scopes beyond basic identity expire after seven days. For ongoing production delivery, complete Google's applicable consent-screen publishing and verification requirements, or reauthorize the sender when Google expires the token. See [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes) and [OAuth app verification](https://support.google.com/cloud/answer/13463073).

## Firebase push

Keep `PROJECT_ID`, `CLIENT_EMAIL`, and `PRIVATE_KEY` as private Render environment variables. `PRIVATE_KEY` may contain literal `\n` sequences; the backend converts them to line breaks. The Firebase web app values and VAPID key stay in the frontend environment only.

Render logs now report Firebase Admin initialization, push-token registration/unregistration, no-token readiness, FCM success/failure counts, and invalid-token removal. Tokens, private keys, refresh tokens, and email addresses are not logged.

The service-account private key and SMTP app password previously appeared in shared conversation/log content. Revoke/rotate those credentials, then store only the replacement Firebase key in Render and the private local environment. Old SMTP settings are no longer used.
