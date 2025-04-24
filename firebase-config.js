const firebaseConfig = {
  apiKey: "AIzaSyAJS3JoOa5O1UReVlOm40gviSvykX2Tv1A",
  authDomain: "sama-api-ai-230202.firebaseapp.com",
  databaseURL: "https://sama-api-ai-230202-default-rtdb.firebaseio.com",
  projectId: "sama-api-ai-230202",
  storageBucket: "sama-api-ai-230202.firebasestorage.app",
  messagingSenderId: "807760837218",
  appId: "1:807760837218:web:ea5575fa14bbc3c0fb6f3b"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
export { database };
