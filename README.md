# Ink Book

A booking book for a tattoo studio. Catch every Instagram, TikTok and WhatsApp enquiry, book sessions, record payments after the tattoo, and keep count of cartridges and supplies.

## What it does
- **Inbox:** quick-add anyone who messages you, with their tattoo idea, size, placement and reference photos. A "waiting for reply" list (oldest first) makes sure no one is forgotten, and **Open chat** jumps straight to their Instagram, TikTok or WhatsApp.
- **Calendar:** book sessions, see the day and the week ahead, and get warned about overlapping bookings.
- **Reminders:** a ready-made reminder message, sent through WhatsApp or copied for Instagram/TikTok.
- **Payment after the tattoo:** mark a session done, enter the final price and what was paid (Cash, eSewa, Khalti, Bank). Anything unpaid goes on the "still owes" list.
- **Money:** each month's money received, expenses and profit.
- **Stock:** cartridges, ink and supplies with low-stock warnings. Cartridges used in a session come off the count automatically; restocks are added to expenses.
- **Export:** clients, bookings and money as CSV files for Excel or Google Sheets.

## How it runs
- A static website on GitHub Pages. Add it to the iPhone home screen from Safari (**Share → Add to Home Screen**).
- Data is shared live between the team through **Firebase** (Cloud Firestore + email sign-in), on the free plan.
- Reference photos are shrunk on the phone and saved in the database, so no paid Firebase Storage is needed.
- Until `firebase-config.js` is filled in, the app runs in **demo mode** and saves only on that device.

## Firebase setup (once)
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Authentication → Sign-in method:** enable **Email/Password**.
3. **Authentication → Settings → Authorized domains:** add `lalitagotame.github.io`.
4. **Firestore Database → Create database** (production mode, a region close to you such as `asia-south1`).
5. **Firestore → Rules:** paste `firestore.rules`, put your two email addresses in it, and **Publish**.
6. **Project settings → Your apps → Web app:** copy the config values into `firebase-config.js`.

Each person then opens the site, taps **Create account** with the email listed in the rules, and confirms it from the email they receive.

## Security
- Only verified accounts whose emails are listed in `firestore.rules` can read or write anything.
- The values in `firebase-config.js` are not secret; the rules protect the data.
- Client details and photos live in Firestore, never in this repository.

Firebase JavaScript SDK (in `vendor/`) © Google LLC, Apache License 2.0.
