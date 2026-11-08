# Hate Mail

See every mailing list that sends you email, and unsubscribe from the ones you don't want.

After years of using one email address, it ends up on hundreds of lists. Hate Mail connects to your account, finds every sender that emails you in bulk, and lists them in one place with an unsubscribe button on each one.

## What it does

- **Connects any email account:** Gmail, Outlook, iCloud, Yahoo, AOL, Zoho, Fastmail, or any other IMAP account. You can connect several at once.
- **Reads headers only:** it looks at who sent each email and when, never what the email says.
- **Lists every sender** with their logo, how many emails they send a month, and when their first email arrived ("Since Mar 2016").
- **Unsubscribes in one click**, or select a batch of senders and unsubscribe from all of them at once.
- **Archives or trashes** everything a sender already sent.
- **Flags "Still sending"** when a sender keeps emailing more than 14 days after you unsubscribed.
- **Sort and filter:** most emails, oldest, newest, A–Z, "Not opened in a year", "One-click", search, or a single account.

## Run it locally

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, and connect your email.

App passwords work right away for Gmail, iCloud, Yahoo, AOL, Zoho and Fastmail. The "Continue with Google" and "Continue with Microsoft" buttons need the sign-in setup below.

## Settings

Copy `.env.example` to `.env.local` and fill in what you need:

| Setting | What it's for |
| --- | --- |
| `ENCRYPTION_KEY` | Encrypts saved passwords and sign-in tokens. Optional locally (a key is created in `data/secret.key`), required in production. Make one with `openssl rand -base64 32`. |
| `APP_URL` | The address the app runs at. Sign-in redirects use it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Sign in with Google |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Sign in with Microsoft |

### Sign in with Google

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Under APIs & Services → Library, enable the **Gmail API**.
3. Open Google Auth Platform (the OAuth consent screen):
   - Audience: choose **External** and add your Gmail address as a test user.
   - Data Access: add the scope `https://mail.google.com/`.
   - Clients: create a **Web application** client with the redirect URI `http://localhost:3000/api/oauth/google/callback`.
4. Put the client ID and secret in `.env.local` and restart `npm run dev`.

While the app is in Testing mode, Google allows up to 100 test users, and each sign-in expires after 7 days (reconnect from the Accounts page). A public launch needs Google's verification for Gmail access.

### Sign in with Microsoft

1. In the [Azure portal](https://portal.azure.com), open Microsoft Entra ID → App registrations → New registration.
2. For supported account types, choose **Accounts in any organizational directory and personal Microsoft accounts**.
3. Add a **Web** redirect URI: `http://localhost:3000/api/oauth/microsoft/callback`.
4. Under Certificates & secrets, create a client secret and copy its value.
5. Under API permissions, add the Microsoft Graph delegated permissions `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid` and `email`.
6. Put the Application (client) ID and the secret in `.env.local` and restart.

Some school and work accounts block outside apps until an admin approves them.

## How it works

- **Scanning:** it scans every mail folder except Sent, Drafts, Trash and Spam (on Gmail, just All Mail), 500 emails at a time. Later scans only check new mail.
- **What counts as a mailing list:** only email with a `List-Unsubscribe`, `List-Id` or bulk `Precedence` header. Personal email is ignored.
- **What gets saved:** sender names and addresses, email counts per month, and each sender's latest unsubscribe link. Subjects and message text are never saved. Passwords and sign-in tokens are encrypted with AES-256-GCM.
- **How it unsubscribes,** best option first:
  1. One-click unsubscribe (RFC 8058).
  2. An unsubscribe email sent from your account.
  3. The sender's unsubscribe page, opened in a new tab.
  4. The unsubscribe link found in their latest email.
- **Safety:** unsubscribe requests made by the server only go to public HTTPS addresses.

## Tests

```bash
npm test
```

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS 4, SQLite (better-sqlite3), ImapFlow, Nodemailer and mailparser.
