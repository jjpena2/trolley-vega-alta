import { useEffect, useState } from 'react'
import { onValue, ref, set, remove, push } from 'firebase/database'
import { db } from '../firebase'

// Anuncios/banners asociados a una parada específica, dentro de un
// pueblo. Ahora una misma parada puede tener VARIOS anuncios, así que
// se guardan en /banners/{puebloId}/{claveParada}/{bannerId}.
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

  // Si bannerId es null, crea uno nuevo (con una llave única). Si ya
  // existe, actualiza ese anuncio específico sin tocar los demás de
  // esa misma parada.
  async function guardarBanner(clave, bannerId, datos) {
    if (!puebloId) return
    const id = bannerId || push(ref(db, `banners/${puebloId}/${clave}`)).key
    await set(ref(db, `banners/${puebloId}/${clave}/${id}`), {
      ...datos,
      actualizado: Date.now(),
    })
  }

  async function eliminarBanner(clave, bannerId) {
    if (!puebloId) return
    await remove(ref(db, `banners/${puebloId}/${clave}/${bannerId}`))
  }

  return {
    // { claveParada: { bannerId: {titulo, descripcion, imagenUrl,
    //   enlace, lat, lng, activo, nombreParada, rutaNombre} } }
    banners: banners || {},
    cargando: banners === null,
    guardarBanner,
    eliminarBanner,
  }
}
