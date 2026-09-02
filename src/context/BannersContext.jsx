import { useEffect, useState } from 'react'
import { onValue, ref, set, remove, push } from 'firebase/database'
import { db } from '../firebase'

// Anuncios/banners asociados a una parada específica, dentro de un
// pueblo. Ahora una misma parada puede tener VARIOS anuncios, así que
// se guardan en /banners/{puebloId}/{claveParada}/{bannerId}.
//
// Además, cada vez que un anuncio se crea, se activa/pausa, o se
// borra, se deja un registro PERMANENTE en /historialAnuncios/{puebloId}
// (que nunca se borra, ni siquiera si el anuncio se borra). Esto es lo
// que le permite a Facturación calcular cuántos días estuvo activo
// cada anuncio DURANTE el mes — así nadie puede "apagar" sus anuncios
// justo antes de que se calcule el cobro para pagar menos.
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

  async function registrarEvento(bannerId, datos) {
    const eventoRef = push(ref(db, `historialAnuncios/${puebloId}`))
    await set(eventoRef, {
      bannerId,
      titulo: datos.titulo,
      precio: datos.precio ?? null,
      activo: datos.activo !== false,
      fecha: Date.now(),
    })
  }

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
    await registrarEvento(id, datos)
  }

  async function eliminarBanner(clave, bannerId, datosActuales) {
    if (!puebloId) return
    // Deja constancia de que se apagó ANTES de borrarlo — así el
    // historial de facturación no pierde los días que sí estuvo activo.
    if (datosActuales) {
      await registrarEvento(bannerId, { ...datosActuales, activo: false })
    }
    await remove(ref(db, `banners/${puebloId}/${clave}/${bannerId}`))
  }

  // Para anuncios que ya existían ANTES de que se agregara el
  // historial: crea un primer registro para ellos usando la fecha en
  // que se crearon/actualizaron por última vez (campo 'actualizado'),
  // para que empiecen a contar en la facturación en vez de quedar en
  // cero. Solo hace falta correrlo una vez por pueblo.
  async function sincronizarHistorialFaltante(bannersConIdFaltantes) {
    for (const b of bannersConIdFaltantes) {
      const eventoRef = push(ref(db, `historialAnuncios/${puebloId}`))
      await set(eventoRef, {
        bannerId: b.bannerId,
        titulo: b.titulo,
        precio: b.precio ?? null,
        activo: b.activo !== false,
        fecha: b.actualizado || b.creado || Date.now(),
      })
    }
  }

  return {
    // { claveParada: { bannerId: {titulo, descripcion, imagenUrl,
    //   enlace, lat, lng, activo, nombreParada, rutaNombre} } }
    banners: banners || {},
    cargando: banners === null,
    guardarBanner,
    eliminarBanner,
    sincronizarHistorialFaltante,
  }
}

// Historial permanente de altas/bajas de anuncios de un pueblo, para
// calcular facturación de forma justa (por días activos reales, no por
// una foto del momento).
export function useHistorialAnuncios(puebloId) {
  const [historial, setHistorial] = useState(null)

  useEffect(() => {
    if (!puebloId) {
      setHistorial(null)
      return
    }
    const historialRef = ref(db, `historialAnuncios/${puebloId}`)
    const unsub = onValue(historialRef, (snap) => {
      setHistorial(snap.exists() ? Object.values(snap.val()) : [])
    })
    return unsub
  }, [puebloId])

  return { historial: historial || [], cargando: historial === null }
}

// Calcula, para un rango de fechas [inicio, fin), cuántos días estuvo
// activo cada anuncio (agrupado por bannerId), usando el historial de
// eventos — "el estado se mantiene hasta el siguiente evento". Un
// anuncio borrado sigue contando los días que SÍ estuvo activo antes
// de borrarse.
export function calcularDiasActivosPorAnuncio(historial, inicio, fin) {
  const porBanner = new Map()
  historial.forEach((e) => {
    if (!porBanner.has(e.bannerId)) porBanner.set(e.bannerId, [])
    porBanner.get(e.bannerId).push(e)
  })

  const resultado = []
  const msPorDia = 24 * 60 * 60 * 1000

  porBanner.forEach((eventos, bannerId) => {
    const ordenados = [...eventos].sort((a, b) => a.fecha - b.fecha)
    const antesDelInicio = ordenados.filter((e) => e.fecha <= inicio)
    let estado = antesDelInicio.length ? antesDelInicio[antesDelInicio.length - 1].activo : false
    let tiempo = inicio
    let msActivo = 0

    const dentroDelRango = ordenados.filter((e) => e.fecha > inicio && e.fecha < fin)
    for (const evento of dentroDelRango) {
      if (estado) msActivo += evento.fecha - tiempo
      tiempo = evento.fecha
      estado = evento.activo
    }
    if (estado) msActivo += fin - tiempo

    const ultimo = ordenados[ordenados.length - 1]
    resultado.push({
      bannerId,
      titulo: ultimo?.titulo || '(sin título)',
      precio: ultimo?.precio ?? null,
      diasActivo: msActivo / msPorDia,
    })
  })

  return resultado
}
