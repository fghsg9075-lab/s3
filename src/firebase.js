// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC7N3IOa7GRETNRBo8P-QKVFzg2bLqoEco",
  authDomain: "students-app-deae5.firebaseapp.com",
  databaseURL: "https://students-app-deae5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "students-app-deae5",
  storageBucket: "students-app-deae5.firebasestorage.app",
  messagingSenderId: "128267767708",
  appId: "1:128267767708:web:08ed73b1563b2f3eb60259"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Analytics might fail if not set up in new project, wrapping in try/catch or just initializing
// Given the prompt didn't strictly ask for analytics but previous code had it, I will keep it but it might warn.
// Actually the previous code had `getAnalytics`. I will include it.
// If the user's project doesn't have analytics enabled, this might throw or warn.
// I'll keep it standard as per previous file.
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

export default app;
