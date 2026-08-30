// Configuración de Firebase.
//
// 1. Ve a https://console.firebase.google.com y crea un proyecto gratis.
// 2. Agrega una "Web app" dentro del proyecto (ícono </>).
// 3. Copia el objeto firebaseConfig que te da Firebase y pégalo abajo.
// 4. En el panel de Firebase activa:
//    - Authentication -> Sign-in method -> Correo/contraseña
//    - Realtime Database -> Crear base de datos (modo de prueba para empezar)
//
// Las reglas sugeridas para Realtime Database están en README.md

import { initializeApp, getApps, deleteApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: 'AIzaSyA1sN1OXTLff1U_j2FGtsLaSBXslaK9mxI',
  authDomain: 'tutrolleypr.firebaseapp.com',
  // TODO: falta este dato — lo obtienes al crear "Realtime Database"
  // (ver README, paso 2). Se ve algo como:
  // "https://tutrolleypr-default-rtdb.firebaseio.com"
  databaseURL: 'https://tutrolleypr-default-rtdb.firebaseio.com',
  projectId: 'tutrolleypr',
  storageBucket: 'tutrolleypr.firebasestorage.app',
  messagingSenderId: '663877930775',
  appId: '1:663877930775:web:ec85cb214af916c31eb152',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getDatabase(app)

// Crear una cuenta nueva con createUserWithEmailAndPassword() en la app
// normal automáticamente "cambia" la sesión activa a esa cuenta nueva
// — nos sacaría del panel de admin. Para evitarlo, usamos una app de
// Firebase SECUNDARIA y temporal solo para crear la cuenta, y la
// destruimos enseguida. La sesión del admin (en la app principal)
// nunca se toca.
export async function crearCuentaSinPerderSesion(correo, contrasena) {
  const nombreApp = `secundaria-${Date.now()}`
  const appSecundaria = initializeApp(firebaseConfig, nombreApp)
  const authSecundaria = getAuth(appSecundaria)
  try {
    const cred = await createUserWithEmailAndPassword(authSecundaria, correo, contrasena)
    const uid = cred.user.uid
    await signOut(authSecundaria)
    return uid
  } finally {
    await deleteApp(appSecundaria)
  }
}

