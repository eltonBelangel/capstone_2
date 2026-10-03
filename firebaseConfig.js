import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getStorage } from "firebase/storage"; // ✅ ADD THIS
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyAQ97DzKR0VKe-QtnP3CUnIv1ECB7cvUXc",
  authDomain: "touramove.firebaseapp.com",
  projectId: "touramove",
  storageBucket: "touramove.firebasestorage.app",
  messagingSenderId: "23676451104",
  appId: "1:23676451104:web:d427ff2f5db5e780c47f45",
};

const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = getAuth(app);
} catch (e) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

const db = getFirestore(app);
const storage = getStorage(app); // ✅ ADD THIS

export { auth, db, storage }; // ✅ EXPORT STORAGE
