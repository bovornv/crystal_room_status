// firebase.js — Crystal Resort Room Status App
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase configuration using environment variables for security
// Set these in your .env file or Vercel environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || "your-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || "your-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || "your-project-id",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || "your-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || "your-sender-id",
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;

