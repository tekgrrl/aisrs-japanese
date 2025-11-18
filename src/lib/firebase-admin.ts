import admin from "firebase-admin";

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string;

export const initAdmin = async () => {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(serviceAccount)),
      });
    } catch (e) {
      console.log("Firebase admin initialization error", e);
    }
  }
};
