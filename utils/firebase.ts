import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const firebaseConfig = {
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
};

initializeApp(firebaseConfig);

const firestore = getFirestore();

// ignore undefined properties in firestore.
firestore.settings({ ignoreUndefinedProperties: true });

export default firestore;
export { Timestamp, FieldValue, firestore };

