import { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { ref, set, get } from 'firebase/database'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const snap = await get(ref(db, `usuarios/${firebaseUser.uid}`))
        setProfile(snap.exists() ? snap.val() : null)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function register({ nombre, correo, contrasena, rol, telefono, ruta, puebloId }) {
    const cred = await createUserWithEmailAndPassword(auth, correo, contrasena)
    await updateProfile(cred.user, { displayName: nombre })

    const perfil = {
      nombre,
      correo,
      rol, // 'chofer' | 'pasajero' | 'admin' | 'superadmin'
      telefono: telefono || '',
      ruta: ruta || '',
      puebloId: rol === 'chofer' ? puebloId || '' : '',
      habilitado: true,
      creado: Date.now(),
    }
    await set(ref(db, `usuarios/${cred.user.uid}`), perfil)
    setProfile(perfil)
    return cred.user
  }

  async function login(correo, contrasena) {
    const cred = await signInWithEmailAndPassword(auth, correo, contrasena)
    const snap = await get(ref(db, `usuarios/${cred.user.uid}`))
    setProfile(snap.exists() ? snap.val() : null)
    return cred.user
  }

  async function logout() {
    // Si es chofer, lo marcamos fuera de servicio al salir.
    if (user && profile?.rol === 'chofer' && profile?.puebloId) {
      await set(ref(db, `choferesActivos/${profile.puebloId}/${user.uid}/activo`), false)
    }
    await signOut(auth)
  }

  const value = { user, profile, loading, register, login, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
