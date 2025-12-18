import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase Admin SDK
if (!getApps().length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (privateKey) {
    // Handle escaped newlines
    privateKey = privateKey.replace(/\\n/g, '\n')
    
    // Robust quote removal
    privateKey = privateKey.trim()
    if (privateKey.startsWith('"')) {
      privateKey = privateKey.slice(1)
    }
    if (privateKey.endsWith('"')) {
      privateKey = privateKey.slice(0, -1)
    }
    // Remove trailing comma if present (common copy-paste error from JSON)
    if (privateKey.endsWith(',')) {
      privateKey = privateKey.slice(0, -1)
    }
  } else {
    console.error('[FirebaseAdmin] FIREBASE_PRIVATE_KEY is missing!');
  }

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  })
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()
