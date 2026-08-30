import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onValue, ref, set, remove, update } from 'firebase/database'
import { db } from '../firebase'
import { crearMotorRutas, RUTAS_SEMILLA } from '../data/routesVegaBaja'
import { usePueblo } from './PuebloContext'

// Antes de que existieran los pueblos, las rutas se guardaban sueltas
// directamente en /rutas/{routeId}. Este hook detecta esas rutas
// "huérfanas" (las que tienen un array de 'paradas' directo en su
// nodo) para poder importarlas a un pueblo nuevo, en vez de perderlas.
export function useRutasHuerfanas() {
  const [huerfanas, setHuerfanas] = useState(null) // null = cargando

  useEffect(() => {
    const rutasRef = ref(db, 'rutas')
    const unsub = onValue(rutasRef, (snap) => {
      if (!snap.exists()) {
        setHuerfanas([])
        return
      }
      const val = snap.val()
      const encontradas = Object.entries(val)
        .filter(([, v]) => Array.isArray(v?.paradas))
        .map(([id, v]) => ({ ...v, id: v.id || id }))
      setHuerfanas(encontradas)
    })
    return unsub
  }, [])

  return huerfanas
}

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

  // 'rutas' representa SIEMPRE los datos reales de este pueblo (vacío
  // si todavía no tiene ninguna) — nunca se rellena en silencio con el
  // ejemplo de Vega Baja, porque eso hacía que un pueblo nuevo se viera
  // idéntico a Vega Baja y confundía a los pasajeros. El ejemplo solo
  // se usa cuando el admin lo pide explícitamente (botón "Importar
  // datos de ejemplo").
  const usandoSemilla = rutasFirebase !== null && rutasFirebase.length === 0
  const rutas = useMemo(() => rutasFirebase || [], [rutasFirebase])

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

  // Copia rutas que ya existían de antes (sueltas, sin pueblo) hacia
  // este pueblo. No borra las que ya tenga el pueblo, solo agrega/
  // reemplaza las que traigas.
  async function importarRutas(rutasAImportar) {
    if (!puebloId || !rutasAImportar.length) return
    const conFecha = Object.fromEntries(
      rutasAImportar.map((r) => [r.id, { ...r, actualizado: Date.now() }])
    )
    await update(ref(db, `rutas/${puebloId}`), conFecha)
  }

  return {
    rutas,
    motor,
    cargando: rutasFirebase === null,
    usandoSemilla,
    guardarRuta,
    eliminarRuta,
    publicarSemilla,
    importarRutas,
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
