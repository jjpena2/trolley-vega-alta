import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onValue, ref, set, remove } from 'firebase/database'
import { db } from '../firebase'
import { crearMotorRutas, RUTAS_SEMILLA } from '../data/routesVegaBaja'

const RoutesContext = createContext(null)

export function RoutesProvider({ children }) {
  const [rutasFirebase, setRutasFirebase] = useState(null) // null = aún cargando
  const [origen, setOrigen] = useState('cargando') // 'cargando' | 'firebase' | 'semilla'

  useEffect(() => {
    const rutasRef = ref(db, 'rutas')
    const unsub = onValue(rutasRef, (snap) => {
      if (snap.exists()) {
        const obj = snap.val()
        setRutasFirebase(Object.values(obj))
        setOrigen('firebase')
      } else {
        setRutasFirebase([])
        setOrigen('semilla')
      }
    })
    return unsub
  }, [])

  // Mientras no haya nada en Firebase, se usa la semilla local (los
  // datos reales de Vega Baja) para que la app funcione desde el
  // primer momento, sin bloquear a nadie esperando que un admin
  // publique algo.
  const rutas = useMemo(() => {
    if (origen === 'firebase') return rutasFirebase
    return RUTAS_SEMILLA
  }, [origen, rutasFirebase])

  const motor = useMemo(() => crearMotorRutas(rutas), [rutas])

  async function guardarRuta(ruta) {
    const conFecha = { ...ruta, actualizado: Date.now() }
    await set(ref(db, `rutas/${ruta.id}`), conFecha)
  }

  async function eliminarRuta(routeId) {
    await remove(ref(db, `rutas/${routeId}`))
  }

  // Publica la semilla local en Firebase tal cual, para que el admin
  // tenga un punto de partida editable en vez de una lista vacía.
  async function publicarSemilla() {
    const conFecha = Object.fromEntries(
      RUTAS_SEMILLA.map((r) => [r.id, { ...r, actualizado: Date.now() }])
    )
    await set(ref(db, 'rutas'), conFecha)
  }

  const value = {
    rutas,
    motor,
    cargando: origen === 'cargando',
    usandoSemilla: origen === 'semilla',
    guardarRuta,
    eliminarRuta,
    publicarSemilla,
  }

  return <RoutesContext.Provider value={value}>{children}</RoutesContext.Provider>
}

export function useRoutes() {
  const ctx = useContext(RoutesContext)
  if (!ctx) throw new Error('useRoutes debe usarse dentro de <RoutesProvider>')
  return ctx
}
