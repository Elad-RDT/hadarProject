import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAqr-Z5cZhOHR9BQM3QjYDbXYV9yXFv1hg",
  authDomain: "hadarcabulary.firebaseapp.com",
  projectId: "hadarcabulary",
  storageBucket: "hadarcabulary.firebasestorage.app",
  messagingSenderId: "571472770663",
  appId: "1:571472770663:web:13ca5f347ceec1608b06c2"
};

// הפעלת האפליקציה של פיירבייס
const app = initializeApp(firebaseConfig);

// ייצוא מסד הנתונים כדי שנוכל להשתמש בו ב-App.jsx
export const db = getFirestore(app);