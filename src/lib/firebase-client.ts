import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  projectId: "aisrs-japanese-dev",
  // You can use dummy values if *only* using emulator
  apiKey: "dummy-key",
  authDomain: "dummy.firebaseapp.com",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

if (process.env.NODE_ENV === "development") {
  connectFirestoreEmulator(db, "localhost", 8080);
}

export { app, db };
