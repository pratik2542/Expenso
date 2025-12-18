const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config({ path: '.env.local' });

async function test() {
  console.log('Testing Firebase Admin Connection...');
  
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) {
    console.error('FIREBASE_PRIVATE_KEY not found in .env.local');
    return;
  }

  // Apply same logic as src/lib/firebaseAdmin.ts
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  // Robust quote removal
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"')) {
    privateKey = privateKey.slice(1);
  }
  if (privateKey.endsWith('"')) {
    privateKey = privateKey.slice(0, -1);
  }

  console.log('Key Start:', privateKey.substring(0, 30));

  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });

    const db = getFirestore();
    console.log('Attempting to fetch collections...');
    const collections = await db.listCollections();
    console.log('Success! Collections:', collections.map(c => c.id));
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

test();
