// Configuração do Firebase para o app Sacola
// Usa a versão modular via CDN, então funciona sem npm/build.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9r05FaSoFNaqf_IMbJI8K9W26ITyokLM",
  authDomain: "sacola-75456.firebaseapp.com",
  projectId: "sacola-75456",
  storageBucket: "sacola-75456.firebasestorage.app",
  messagingSenderId: "939668118354",
  appId: "1:939668118354:web:959db6b0ce88b819b5388b",
  measurementId: "G-5S4FEVTKTP"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Banco de dados (Firestore) — onde ficam as compras, listas e perfis
export const db = getFirestore(app);

// Autenticação (login com Google)
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Permite que o app funcione offline, guardando dados localmente
// e sincronizando automaticamente quando a internet voltar
enableIndexedDbPersistence(db).catch((erro) => {
  console.warn("Persistência offline não pôde ser ativada:", erro.code);
});
