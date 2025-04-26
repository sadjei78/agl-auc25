// Import the functions you need from the SDKs you need
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getDatabase, ref, set, onValue, push, get, child } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAJS3JoOa5O1UReVlOm40gviSvykX2Tv1A",
  authDomain: "sama-api-ai-230202.firebaseapp.com",
  databaseURL: "https://sama-api-ai-230202-default-rtdb.firebaseio.com",
  projectId: "sama-api-ai-230202",
  storageBucket: "sama-api-ai-230202.firebasestorage.app",
  messagingSenderId: "807760837218",
  appId: "1:807760837218:web:ea5575fa14bbc3c0fb6f3b"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// Export the initialized instances and all needed functions
export { app, auth, database, ref, set, onValue, push, get, child };
