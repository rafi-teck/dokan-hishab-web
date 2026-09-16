// ---------- Firebase config ----------
// firebase.google.com -এ গিয়ে একটা ফ্রি প্রজেক্ট বানান (Spark/ফ্রি প্ল্যান যথেষ্ট)।
// Project settings > General > "Your apps" > Web app (</>) থেকে এই মানগুলো কপি করে
// .env ফাইলে বসান (নিচে .env.example দেখুন)। Vercel-এ ডিপ্লয় করার সময় একই মান
// Vercel প্রজেক্টের Environment Variables-এ বসাতে হবে।
//
// এছাড়া Firestore চালু করুন: Firebase Console > Build > Firestore Database > Create database
// (production mode বা test mode, যেকোনোটা — নিচের rules অংশ দেখুন)

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// শপের সব ডেটা "shopData" কালেকশনে, প্রতিটা key = একটা ডকুমেন্ট।
// এটা আগের window.storage.get/set এর মতোই কাজ করে, তাই App.jsx-এর বাকি কোড অপরিবর্তিত থাকে।
export async function storeGet(key) {
  try {
    const snap = await getDoc(doc(db, "shopData", key));
    if (!snap.exists()) return null;
    return snap.data().value ?? null;
  } catch (e) {
    console.error("Firestore get failed", key, e);
    return null;
  }
}

export async function storeSet(key, value) {
  try {
    await setDoc(doc(db, "shopData", key), { value, updatedAt: Date.now() });
  } catch (e) {
    console.error("Firestore set failed", key, e);
  }
}
