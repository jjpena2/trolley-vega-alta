import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onValue, ref, set, remove } from 'firebase/database'
import { db } from '../firebase'
import { crearMotorRutas, RUTAS_SEMILLA } from '../data/routesVegaBaja'
import { usePueblo } from './PuebloContext'

// Hook reutilizable: rutas de UN pueblo específico, con lectura en vivo
// y las funciones de escritura para administrarlas. Se usa tanto para
// "el pueblo que el pasajero está viendo ahora" (vía RoutesProvider más
// abajo) como para "el pueblo que un admin está editando en el panel"
// (que puede ser distinto al que esa misma persona ve como pasajero).
export function useRoutesForPueblo(puebloId) {
  const [rutasFirebase, setRutasFirebase] = useState(null) // null = cargando

  useEffect(() => {
    if (!puebloId) {
      setRutasFirebase(null)
      return
    }
    const rutasRef = ref(db, `rutas/${puebloId}`)
    const unsub = onValue(rutasRef, (snap) => {
      setRutasFirebase(snap.exists() ? Object.values(snap.val()) : [])
    })
    return unsub
  }, [puebloId])

  // Mientras ese pueblo no tenga rutas propias publicadas, se muestran
  // los datos de ejemplo de Vega Baja como punto de partida.
  const usandoSemilla = rutasFirebase !== null && rutasFirebase.length === 0
  const rutas = useMemo(() => {
    if (rutasFirebase && rutasFirebase.length) return rutasFirebase
    return RUTAS_SEMILLA
  }, [rutasFirebase])

  const motor = useMemo(() => crearMotorRutas(rutas), [rutas])

  async function guardarRuta(ruta) {
    if (!puebloId) return
    await set(ref(db, `rutas/${puebloId}/${ruta.id}`), { ...ruta, actualizado: Date.now() })
  }

  async function eliminarRuta(routeId) {
    if (!puebloId) return
    await remove(ref(db, `rutas/${puebloId}/${routeId}`))
  }

  async function publicarSemilla() {
    if (!puebloId) return
    const conFecha = Object.fromEntries(
      RUTAS_SEMILLA.map((r) => [r.id, { ...r, actualizado: Date.now() }])
    )
    await set(ref(db, `rutas/${puebloId}`), conFecha)
  }

  return {
    rutas,
    motor,
    cargando: rutasFirebase === null,
    usandoSemilla,
    guardarRuta,
    eliminarRuta,
    publicarSemilla,
  }
}

// Contexto "ambiental": siempre usa el pueblo que el pasajero eligió en
// el selector de arriba de la app (PuebloContext).
const RoutesContext = createContext(null)

export function RoutesProvider({ children }) {
  const { puebloActivo } = usePueblo()
  const valor = useRoutesForPueblo(puebloActivo?.id)
  return <RoutesContext.Provider value={valor}>{children}</RoutesContext.Provider>
}

export function useRoutes() {
  const ctx = useContext(RoutesContext)
  if (!ctx) throw new Error('useRoutes debe usarse dentro de <RoutesProvider>')
  return ctx
}
