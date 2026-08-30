import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onValue, ref, set, remove } from 'firebase/database'
import { db } from '../firebase'

const PuebloContext = createContext(null)

// Mientras nadie haya creado un pueblo todavía en Firebase, la app
// muestra este pueblo de respaldo (usando los datos de ejemplo de Vega
// Baja) para que nunca se vea vacía. En cuanto un superadmin crea el
// primer pueblo real, este respaldo deja de usarse.
const PUEBLO_RESPALDO = { id: 'default', nombre: 'Trolley Vega Alta' }

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function PuebloProvider({ children }) {
  const [pueblosFirebase, setPueblosFirebase] = useState(null) // null = cargando
  const [puebloActivoId, setPuebloActivoIdState] = useState(() => {
    try {
      return localStorage.getItem('puebloActivoId') || null
    } catch {
      return null
    }
  })

  useEffect(() => {
    const pueblosRef = ref(db, 'pueblos')
    const unsub = onValue(pueblosRef, (snap) => {
      setPueblosFirebase(snap.exists() ? Object.values(snap.val()) : [])
    })
    return unsub
  }, [])

  const pueblos = pueblosFirebase || [] // lista real (puede estar vacía)
  const pueblosParaMostrar = pueblos.length ? pueblos : [PUEBLO_RESPALDO]

  const puebloActivo = useMemo(
    () => pueblosParaMostrar.find((p) => p.id === puebloActivoId) || pueblosParaMostrar[0],
    [pueblosParaMostrar, puebloActivoId]
  )

  function setPuebloActivo(id) {
    setPuebloActivoIdState(id)
    try {
      localStorage.setItem('puebloActivoId', id)
    } catch {
      // si el navegador bloquea localStorage, no pasa nada grave
    }
  }

  async function crearPueblo(nombre) {
    const id = slugificar(nombre) || `pueblo-${Date.now()}`
    await set(ref(db, `pueblos/${id}`), { id, nombre: nombre.trim(), creado: Date.now() })
    return id
  }

  async function eliminarPueblo(id) {
    await remove(ref(db, `pueblos/${id}`))
    await remove(ref(db, `rutas/${id}`))
    await remove(ref(db, `choferesActivos/${id}`))
  }

  const value = {
    pueblos, // lista real, para el panel de administración
    cargando: pueblosFirebase === null,
    puebloActivo, // el que está viendo el pasajero ahora mismo
    setPuebloActivo,
    crearPueblo,
    eliminarPueblo,
  }

  return <PuebloContext.Provider value={value}>{children}</PuebloContext.Provider>
}

export function usePueblo() {
  const ctx = useContext(PuebloContext)
  if (!ctx) throw new Error('usePueblo debe usarse dentro de <PuebloProvider>')
  return ctx
}
