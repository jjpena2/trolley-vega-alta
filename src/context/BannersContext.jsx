import { useEffect, useState } from 'react'
import { onValue, ref, set, remove } from 'firebase/database'
import { db } from '../firebase'

// Anuncios/banners asociados a una parada específica, dentro de un
// pueblo. Se guardan en /banners/{puebloId}/{claveParada}.
export function useBannersForPueblo(puebloId) {
  const [banners, setBanners] = useState(null) // null = cargando

  useEffect(() => {
    if (!puebloId) {
      setBanners(null)
      return
    }
    const bannersRef = ref(db, `banners/${puebloId}`)
    const unsub = onValue(bannersRef, (snap) => {
      setBanners(snap.exists() ? snap.val() : {})
    })
    return unsub
  }, [puebloId])

  async function guardarBanner(clave, datos) {
    if (!puebloId) return
    await set(ref(db, `banners/${puebloId}/${clave}`), {
      ...datos,
      actualizado: Date.now(),
    })
  }

  async function eliminarBanner(clave) {
    if (!puebloId) return
    await remove(ref(db, `banners/${puebloId}/${clave}`))
  }

  return {
    banners: banners || {}, // { claveParada: {titulo, descripcion, imagenUrl, enlace, activo, nombreParada} }
    cargando: banners === null,
    guardarBanner,
    eliminarBanner,
  }
}
