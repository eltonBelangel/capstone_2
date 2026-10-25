import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
} from "firebase/auth";
import { getStorage } from "firebase/storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyAQ97DzKR0VKe-QtnP3CUnIv1ECB7cvUXc",
  authDomain: "touramove.firebaseapp.com",
  projectId: "touramove",
  storageBucket: "touramove.firebasestorage.app",
  messagingSenderId: "23676451104",
  appId: "1:23676451104:web:d427ff2f5db5e780c47f45",
};

const isNew = getApps().length === 0;
const app = isNew ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  if (e.code === "auth/already-initialized") {
    auth = getAuth(app);
  } else {
    throw e;
  }
}

// Long polling is more reliable on React Native / emulators / restricted networks
let db;
try {
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
} catch (e) {
  // Already initialized (e.g. hot reload)
  const { getFirestore } = require("firebase/firestore");
  db = getFirestore(app);
}

const storage = getStorage(app);

export { auth, db, storage };