'use client';

import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { forceWebSockets, getDatabase, type Database } from 'firebase/database';
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth } from 'firebase/auth';

/**
 * Positions ride Firebase RTDB rather than Supabase Realtime. Presence fan-out
 * on the Supabase free tier tops out around twenty messages a second, which a
 * single phone sweeping the dial can exhaust on its own; RTDB handled thirty
 * phones at three updates a second in load testing with no drops.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let db: Database | null = null;
let uid: Promise<string> | null = null;

export function roomDb(): Database {
  if (db) return db;
  if (!config.databaseURL) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_DATABASE_URL. See .env.example.');
  }
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  // The CSP permits database sockets, but not the script injection used by
  // RTDB long polling. A remembered socket failure otherwise selects that
  // blocked fallback and leaves returning/reconnecting phones stuck forever.
  forceWebSockets();
  db = getDatabase(app);
  return db;
}

/**
 * Every client signs in anonymously before it touches the database.
 *
 * The uid is what the rules pin a phone's node to, so a phone can only write
 * where its own identity says it may -- without it, knowing the room path is
 * enough to overwrite or delete anyone else's dot. Nobody is asked to log in;
 * the sign-in is invisible and the account is thrown away with the tab.
 *
 * Memoised: one identity per page, reused by every caller.
 */
export function roomAuth(): Promise<string> {
  if (uid) return uid;

  const auth: Auth = getAuth(getApps()[0] ?? initializeApp(config));

  const attempt = new Promise<string>((resolve, reject) => {
    // A session may already exist in this browser, so watch for it before
    // asking for a new one -- signing in twice would orphan the first node.
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (!user) return;
        stop();
        resolve(user.uid);
      },
      (error) => {
        stop();
        reject(error);
      },
    );
    signInAnonymously(auth).catch(reject);
  });

  // Memoising the rejection too would turn one bad moment -- a laptop still
  // waking, a wifi handover, a captive portal answering the first request --
  // into a page that never connects again for as long as it stays open. It
  // would go on drawing a QR code the whole time. Forget a failed attempt so
  // the next caller starts a fresh one.
  void attempt.catch(() => {
    if (uid === attempt) uid = null;
  });

  uid = attempt;
  return uid;
}
