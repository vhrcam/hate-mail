# Hate Mail

A web app that finds every mailing list sending you email and lets you unsubscribe from the ones you don't want.

Most people have used the same email address for ten years or more, and in that time it lands on hundreds of lists: stores you bought from once, apps you tried, newsletters you never read. Unsubscribing one email at a time never keeps up. Hate Mail connects to your mailbox, finds everyone sending you bulk email, and lists them in one place, with the date their first email arrived and an unsubscribe button on each one.

## Sign in

There's no Hate Mail password. Pick your email provider from the list and sign in, and you stay signed in on that browser.

- **Google and Outlook:** go to Google's or Microsoft's own sign-in page once the sign-in keys are set up (see [Setup](#setup)). Until then, Google accounts use an app password.
- **iCloud, Yahoo and AOL:** use an app password. Hate Mail shows the steps for your provider, with a link to the right settings page.
- **Other email:** type your address and Hate Mail looks up the server settings for your domain. School and work accounts that run on Google or Microsoft go to the right sign-in. You can change the settings under Server settings.
- **Proton Mail** can't connect. Proton only lets other apps in through Proton Bridge, a desktop app.

The menu at the top right shows the account you're looking at. Open it to switch to another one, add another account, or sign out of the one you're on. Signing out makes Hate Mail forget that account and its senders on that browser. Nothing in your mailbox changes.

## What it does

- **Finds every mailing list.** Hate Mail reads who each email is from and when, across your inbox and other folders (on Gmail, All Mail). It only keeps email sent to a list, meaning anything with an unsubscribe or mailing list header. Email from people is left out.
- **One box per sender:**
  - their logo, or their first letter in a circle when they don't have one
  - their name and address
  - how many emails they send a month
  - "Since": the date of the first email they sent you. That's usually the welcome email, so it shows about when you signed up.
- **Unsubscribe** with the button on the right. What it does depends on what the sender supports:
  - **One-click:** Hate Mail unsubscribes you in the background. Most big senders support this.
  - **Unsubscribe email:** Hate Mail sends it from your account.
  - **Unsubscribe page:** the button has a ↗ and opens their page in a new tab.
  - **No unsubscribe info:** Hate Mail finds the unsubscribe link in their latest email and opens it.
- **Unsubscribe from a lot at once.** Check the boxes (or Select all) and press Unsubscribe in the bar at the bottom. One-click senders are done right away. Any that need their website are marked with ↗.
- **Still sending.** If a sender keeps emailing more than 14 days after you unsubscribed, it gets a Still sending tag and an Unsubscribe again button. That button takes you to their unsubscribe page this time. US law gives senders 10 business days.
- **Sort and filter.** Sort by most emails, oldest first, newest first, or A–Z. Filter by Not opened in a year or One-click, or search by name or address.
- **Unsubscribed senders** dim in place, so the list doesn't jump while you work down it. They move to the bottom the next time you open Hate Mail.
- **Scanning.** The first scan goes through all of your mail, 500 emails at a time, with a progress bar. After that, Hate Mail only checks new mail. It checks when you open it (if the last check was over 15 minutes ago) and when you press Refresh.
- **Works on phones.** The boxes stack and the button moves under each sender.

## Good to know

- **Your mailbox stays as it is.** Folders are opened read-only, so nothing is moved, deleted or marked as read. The only thing Hate Mail does in your account is send an unsubscribe email when a sender asks for one.
- **What's saved:** sender names and addresses, email counts per month, and each sender's latest unsubscribe link, in a SQLite database in `data/`. Subjects and message text are never saved.
- **Encryption:** app passwords and sign-in tokens are encrypted with AES-256-GCM.
- **Logos** come from Google's public favicon service, which sees your senders' website names. It never sees your email address.
- **Safety:** unsubscribe requests that Hate Mail sends itself only go to public HTTPS addresses.
- **Google's limits:** while your Google sign-in keys are in Testing mode, Google allows up to 100 test users, and sign-ins expire after 7 days. Hate Mail shows a Reconnect button when that happens. A public launch needs Google's verification for Gmail access.
- **Work and school accounts:** some block outside apps until an admin approves them.

## Setup

You need [Node.js](https://nodejs.org) 22 or newer.

```
git clone https://github.com/vhrcam/hate-mail.git
cd hate-mail
npm install
npm run dev
```

npm may warn about install scripts. Hate Mail doesn't need them, so you can ignore it. Open http://localhost:3000 and connect your email. App passwords work right away.

### Settings

Copy `.env.example` to `.env.local` and fill in what you need:

| Setting | What it's for |
| --- | --- |
| `ENCRYPTION_KEY` | Encrypts saved passwords and sign-in tokens. Optional on your own computer (Hate Mail makes one in `data/secret.key`), required on a server. Make one with `openssl rand -base64 32`. |
| `APP_URL` | The address Hate Mail runs at. Google and Microsoft send you back here after you sign in. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Continue with Google |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Continue with Microsoft |

### Continue with Google

1. In the [Google Cloud Console](https://console.cloud.google.com), create a project.
2. Under APIs & Services → Library, enable the **Gmail API**.
3. Open Google Auth Platform (the OAuth consent screen):
   - Audience: choose **External** and add your Gmail address as a test user.
   - Data Access: add the scope `https://mail.google.com/`.
   - Clients: create a **Web application** client with the redirect URI `http://localhost:3000/api/oauth/google/callback`.
4. Put the client ID and secret in `.env.local` and restart `npm run dev`.

### Continue with Microsoft

1. In the [Azure portal](https://portal.azure.com), open Microsoft Entra ID → App registrations → New registration.
2. For supported account types, choose **Accounts in any organizational directory and personal Microsoft accounts**.
3. Add a **Web** redirect URI: `http://localhost:3000/api/oauth/microsoft/callback`.
4. Under Certificates & secrets, create a client secret and copy its value.
5. Under API permissions, add the Microsoft Graph delegated permissions `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid` and `email`.
6. Put the Application (client) ID and the secret in `.env.local` and restart.

## Tests

```
npm test
```

They cover header parsing, finding unsubscribe links, the monthly email counts, provider detection, and the checks that keep unsubscribe requests off private addresses.

## Built with

Next.js 16, React 19, TypeScript, Tailwind CSS 4, SQLite (better-sqlite3), ImapFlow, Nodemailer and mailparser.
