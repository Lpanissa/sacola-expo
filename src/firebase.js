// src/firebase.js
// Igual ao firebase-config.js do site, mas com o SDK nativo
// (@react-native-firebase), que faz o Firestore guardar os dados no
// próprio aparelho (SQLite nativo) e continuar funcionando offline
// mesmo depois de fechar e abrir o app de novo.

import { getApp } from "@react-native-firebase/app";
import auth, { GoogleAuthProvider } from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";

export const app = getApp();
export const db = firestore();
export const authInstance = auth();
export const googleAuthProvider = GoogleAuthProvider;

// Offline já vem ativado por padrão no SDK nativo; isso só garante que o
// cache não expira enquanto o app estiver instalado.
db.settings({ persistence: true });
