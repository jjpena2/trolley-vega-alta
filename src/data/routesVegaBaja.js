// Motor de rutas: funciones de geometría (siempre puras, no dependen
// de qué rutas existan) + una "fábrica" (crearMotorRutas) que arma
// todas las herramientas de búsqueda/planificación a partir de la
// lista de rutas ACTUAL (que ahora vive en Firebase y puede cambiar en
// cualquier momento desde el panel de administración).
//
// Cada parada es un objeto: { codigo, nombre, orden, lat?, lng?, anclaId? }
//  - orden: posición dentro de la ruta (para saber el orden de paso e
//    interpolar coordenadas de las paradas sin lat/lng propio).
//  - lat/lng: si están presentes, es un punto real conocido ("ancla").
//    Si faltan, su posición se interpola entre los puntos conocidos
//    más cercanos (anterior y siguiente) según 'orden'.
//  - anclaId: opcional. Si dos paradas de RUTAS DISTINTAS comparten el
//    mismo anclaId, se tratan como el mismo lugar físico (punto de
//    transbordo).
//
// RUTAS_SEMILLA trae los datos reales de Vega Baja (MOVICI) como punto
// de partida, pero la fuente de verdad en producción es Firebase.

import { RUTAS_SEMILLA as RUTAS_SEMILLA_DATOS } from './rutasSemilla.js'
export const RUTAS_SEMILLA = RUTAS_SEMILLA_DATOS

// ---------- Matemática de geometría (pura) ----------

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function acumularDistancias(puntos) {
  const acumulada = [0]
  for (let i = 1; i < puntos.length; i++) {
    acumulada.push(acumulada[i - 1] + haversineKm(puntos[i - 1], puntos[i]))
  }
  return acumulada
}

function puntoADistancia(puntos, acumulada, distanciaObjetivo) {
  if (distanciaObjetivo <= 0) return puntos[0]
  const total = acumulada[acumulada.length - 1]
  if (distanciaObjetivo >= total) return puntos[puntos.length - 1]
  let i = 1
  while (acumulada[i] < distanciaObjetivo) i++
  const a = puntos[i - 1]
  const b = puntos[i]
  const segLen = acumulada[i] - acumulada[i - 1] || 0.0001
  const t = (distanciaObjetivo - acumulada[i - 1]) / segLen
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function esPuntoConocido(p) {
  return p.lat != null && p.lng != null
}

// Versión rápida (sin internet): interpola en línea recta entre los
// puntos conocidos de la ruta. Se usa como respaldo instantáneo
// mientras se carga la versión real, o si falla el servicio de rutas.
export function construirGeometriaAproximada(ruta) {
  const paradas = ruta.paradas
  const conocidosIdx = paradas
    .map((p, i) => (esPuntoConocido(p) ? i : -1))
    .filter((i) => i !== -1)

  const coords = paradas.map((p, i) => {
    if (esPuntoConocido(p)) return [p.lat, p.lng]
    const prevIdx = [...conocidosIdx].reverse().find((a) => a < i)
    const nextIdx = conocidosIdx.find((a) => a > i)
    if (prevIdx === undefined && nextIdx === undefined) return [p.lat || 0, p.lng || 0]
    if (prevIdx === undefined) return [paradas[nextIdx].lat, paradas[nextIdx].lng]
    if (nextIdx === undefined) return [paradas[prevIdx].lat, paradas[prevIdx].lng]
    const prevP = paradas[prevIdx]
    const nextP = paradas[nextIdx]
    const total = nextP.orden - prevP.orden || 1
    const t = (p.orden - prevP.orden) / total
    return [
      prevP.lat + (nextP.lat - prevP.lat) * t,
      prevP.lng + (nextP.lng - prevP.lng) * t,
    ]
  })

  let acumulada = 0
  const paradasConGeo = paradas.map((p, i) => {
    if (i > 0) acumulada += haversineKm(coords[i - 1], coords[i])
    return { ...p, lat: coords[i][0], lng: coords[i][1], distanciaKm: acumulada }
  })

  return {
    ...ruta,
    paradas: paradasConGeo,
    distanciaTotalKm: acumulada,
    geometry: coords,
    esAproximada: true,
  }
}

const cacheGeometriaReal = new Map()

// Consulta OSRM (servicio de ruteo gratuito y público) para obtener la
// línea REAL siguiendo carreteras entre los puntos conocidos de una
// ruta, y ubica las paradas intermedias sobre esa línea real.
export async function construirGeometriaReal(ruta) {
  const claveCache = `${ruta.id}:${ruta.actualizado || 0}`
  if (cacheGeometriaReal.has(claveCache)) return cacheGeometriaReal.get(claveCache)

  const paradas = ruta.paradas
  const conocidos = paradas.filter(esPuntoConocido)
  if (conocidos.length < 2) {
    const aprox = construirGeometriaAproximada(ruta)
    cacheGeometriaReal.set(claveCache, aprox)
    return aprox
  }

  const coordsUrl = conocidos.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsUrl}?overview=full&geometries=geojson`

  const resp = await fetch(url)
  if (!resp.ok) throw new Error('OSRM respondió con error')
  const data = await resp.json()
  const ruta0 = data.routes?.[0]
  if (!ruta0) throw new Error('OSRM no devolvió una ruta')

  const geometry = ruta0.geometry.coordinates.map(([lon, lat]) => [lat, lon])
  const geomAcumulada = acumularDistancias(geometry)

  const conocidoDistanciaKm = [0]
  for (const leg of ruta0.legs) {
    conocidoDistanciaKm.push(conocidoDistanciaKm[conocidoDistanciaKm.length - 1] + leg.distance / 1000)
  }

  const conocidosIdx = paradas.map((p, i) => (esPuntoConocido(p) ? i : -1)).filter((i) => i !== -1)
  let contador = 0
  const ordenADistancia = new Map()
  conocidosIdx.forEach((idx) => {
    ordenADistancia.set(paradas[idx].orden, conocidoDistanciaKm[contador])
    contador++
  })

  const paradasConGeo = paradas.map((p, i) => {
    let distReal
    if (esPuntoConocido(p)) {
      distReal = ordenADistancia.get(p.orden)
    } else {
      const prevIdx = [...conocidosIdx].reverse().find((a) => a < i)
      const nextIdx = conocidosIdx.find((a) => a > i)
      const prevOrden = prevIdx === undefined ? 0 : paradas[prevIdx].orden
      const nextOrden = nextIdx === undefined ? p.orden + 1 : paradas[nextIdx].orden
      const prevDist = prevIdx === undefined ? 0 : ordenADistancia.get(prevOrden)
      const nextDist =
        nextIdx === undefined
          ? geomAcumulada[geomAcumulada.length - 1]
          : ordenADistancia.get(nextOrden)
      const t = (p.orden - prevOrden) / (nextOrden - prevOrden || 1)
      distReal = prevDist + (nextDist - prevDist) * t
    }
    const [lat, lng] = puntoADistancia(geometry, geomAcumulada, distReal)
    return { ...p, lat, lng, distanciaKm: distReal }
  })

  const resultado = {
    ...ruta,
    paradas: paradasConGeo,
    distanciaTotalKm: geomAcumulada[geomAcumulada.length - 1],
    geometry,
    geometryAcumulada: geomAcumulada,
    esAproximada: false,
  }
  cacheGeometriaReal.set(claveCache, resultado)
  return resultado
}

function proyectarSobreGeometria(geometria, posicion) {
  const puntos = geometria.geometry
  const acumulada = geometria.geometryAcumulada || acumularDistancias(puntos)

  let mejorDist = Infinity
  let mejorAcumulada = 0

  for (let i = 0; i < puntos.length - 1; i++) {
    const [ay, ax] = puntos[i]
    const [by, bx] = puntos[i + 1]
    const segLenKm = acumulada[i + 1] - acumulada[i] || 0.0001

    const abx = bx - ax
    const aby = by - ay
    const apx = posicion.lng - ax
    const apy = posicion.lat - ay
    const lenSq = abx * abx + aby * aby || 0.0000001
    let t = (apx * abx + apy * aby) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projLat = ay + aby * t
    const projLng = ax + abx * t
    const dist = haversineKm([posicion.lat, posicion.lng], [projLat, projLng])

    if (dist < mejorDist) {
      mejorDist = dist
      mejorAcumulada = acumulada[i] + segLenKm * t
    }
  }
  return { distanciaAlChofer: mejorDist, progresoKm: mejorAcumulada }
}

// Calcula, para cada parada, la distancia restante y el tiempo estimado
// de llegada según la posición GPS actual del chofer.
export function calcularLlegadasPorDistancia(geometria, posicionChofer, velocidadKmh = 18) {
  const { distanciaAlChofer, progresoKm } = proyectarSobreGeometria(geometria, posicionChofer)

  const paradasConEta = geometria.paradas.map((p) => {
    let restanteKm = p.distanciaKm - progresoKm
    let vuelta = false
    if (restanteKm < -0.05) {
      restanteKm += geometria.distanciaTotalKm
      vuelta = true
    }
    restanteKm += distanciaAlChofer
    const minutos = Math.max(0, Math.round((restanteKm / velocidadKmh) * 60))
    return { ...p, restanteKm, minutos, vuelta }
  })

  const proxima = [...paradasConEta]
    .filter((p) => p.restanteKm > 0.06)
    .sort((a, b) => a.restanteKm - b.restanteKm)[0]

  return {
    color: geometria.color,
    distanciaTotalKm: geometria.distanciaTotalKm,
    distanciaAlChofer,
    paradas: paradasConEta,
    proximaCodigo: proxima?.codigo,
  }
}

// Solo el TRAMO de la línea entre dos distancias acumuladas (en km).
export function segmentoEntreDistancias(geometria, distanciaDesde, distanciaHasta) {
  const puntos = geometria.geometry
  const acumulada = geometria.geometryAcumulada || acumularDistancias(puntos)
  const total = acumulada[acumulada.length - 1]

  function tramo(dA, dB) {
    const resultado = [puntoADistancia(puntos, acumulada, dA)]
    for (let i = 0; i < puntos.length; i++) {
      if (acumulada[i] > dA && acumulada[i] < dB) resultado.push(puntos[i])
    }
    resultado.push(puntoADistancia(puntos, acumulada, dB))
    return resultado
  }

  if (distanciaHasta >= distanciaDesde) return tramo(distanciaDesde, distanciaHasta)
  return [...tramo(distanciaDesde, total), ...tramo(0, distanciaHasta)]
}

export function distanciaDeParada(geometria, codigo) {
  const p = geometria.paradas.find((x) => x.codigo === codigo)
  return p ? p.distanciaKm : null
}

export function obtenerTrazado(geometria) {
  return geometria.geometry
}

// ---------- Fábrica: depende de la lista de rutas ACTUAL ----------
// Se vuelve a crear cada vez que cambian las rutas (por ejemplo, cuando
// un admin edita algo desde el panel), gracias a useMemo en
// RoutesContext.
export function crearMotorRutas(rutas) {
  function obtenerRuta(id) {
    return rutas.find((r) => r.id === id) || null
  }

  // anclaId -> Set(routeId) — para detectar puntos de transbordo
  const anclaARutas = new Map()
  rutas.forEach((r) => {
    r.paradas.forEach((p) => {
      if (!p.anclaId) return
      if (!anclaARutas.has(p.anclaId)) anclaARutas.set(p.anclaId, new Set())
      anclaARutas.get(p.anclaId).add(r.id)
    })
  })

  function conexionesDe(parada, rutaActualId) {
    if (!parada.anclaId) return []
    const ids = anclaARutas.get(parada.anclaId)
    if (!ids || ids.size < 2) return []
    return [...ids].filter((id) => id !== rutaActualId).map(obtenerRuta).filter(Boolean)
  }

  function conConexiones(geometria, rutaId) {
    return {
      ...geometria,
      paradas: geometria.paradas.map((p) => ({ ...p, conexiones: conexionesDe(p, rutaId) })),
    }
  }

  function geometriaAproximadaConConexiones(ruta) {
    return conConexiones(construirGeometriaAproximada(ruta), ruta.id)
  }

  async function geometriaRealConConexiones(ruta) {
    return conConexiones(await construirGeometriaReal(ruta), ruta.id)
  }

  // "Lugar" = un punto real, sin importar cuántas rutas pasen por él.
  const porAnclaId = new Map()
  const LUGARES = []
  rutas.forEach((r) => {
    r.paradas.forEach((p) => {
      if (p.anclaId) {
        let lugar = porAnclaId.get(p.anclaId)
        if (!lugar) {
          lugar = { nombre: p.nombre, anclaId: p.anclaId, instancias: [] }
          porAnclaId.set(p.anclaId, lugar)
          LUGARES.push(lugar)
        }
        lugar.instancias.push({ routeId: r.id, orden: p.orden, codigo: p.codigo })
      } else {
        LUGARES.push({
          nombre: p.nombre,
          anclaId: null,
          instancias: [{ routeId: r.id, orden: p.orden, codigo: p.codigo }],
        })
      }
    })
  })

  function lugarPorNombreExacto(texto) {
    const q = texto.trim().toLowerCase()
    return LUGARES.find((l) => l.nombre.toLowerCase() === q) || null
  }

  // Para los <select> agrupados del planificador.
  const nombreCanonico = new Map()
  LUGARES.forEach((lugar) => {
    lugar.instancias.forEach((inst) => {
      nombreCanonico.set(`${inst.routeId}|${inst.codigo}`, lugar.nombre)
    })
  })
  const RUTA_A_LUGARES = rutas.map((r) => {
    const vistos = new Set()
    const lugares = []
    r.paradas.forEach((p) => {
      const nombre = nombreCanonico.get(`${r.id}|${p.codigo}`) || p.nombre
      if (vistos.has(nombre)) return
      vistos.add(nombre)
      lugares.push(nombre)
    })
    return { routeId: r.id, routeNombre: r.nombre, color: r.color, lugares }
  })

  // Tiempo estimado entre dos paradas de una misma ruta, usando
  // distancia real aproximada y una velocidad promedio asumida (misma
  // lógica que el resto de la app, para que los números sean
  // consistentes en toda la aplicación).
  function minutosEntreEnRuta(ruta, codigoInicio, codigoFin, velocidadKmh = 18) {
    const g = construirGeometriaAproximada(ruta)
    const total = g.distanciaTotalKm || 0.001
    const dA = distanciaDeParada(g, codigoInicio)
    const dB = distanciaDeParada(g, codigoFin)
    if (dA == null || dB == null) return null
    let restante = dB - dA
    if (restante < 0) restante += total
    return Math.max(0, Math.round((restante / velocidadKmh) * 60))
  }

  function planificarViaje(nombreOrigen, nombreDestino) {
    const origen = lugarPorNombreExacto(nombreOrigen)
    const destino = lugarPorNombreExacto(nombreDestino)
    if (!origen || !destino) return { error: 'no-encontrado' }
    if (origen === destino) return { tipo: 'mismo-lugar' }

    let mejorDirecto = null
    origen.instancias.forEach((oi) => {
      destino.instancias.forEach((di) => {
        if (oi.routeId !== di.routeId) return
        const ruta = obtenerRuta(oi.routeId)
        const minutos = minutosEntreEnRuta(ruta, oi.codigo, di.codigo)
        if (minutos == null) return
        if (!mejorDirecto || minutos < mejorDirecto.minutos) {
          mejorDirecto = {
            tipo: 'directo',
            ruta,
            origen: { nombre: origen.nombre, codigo: oi.codigo },
            destino: { nombre: destino.nombre, codigo: di.codigo },
            minutos,
          }
        }
      })
    })
    if (mejorDirecto) return mejorDirecto

    let mejorTransbordo = null
    origen.instancias.forEach((oi) => {
      destino.instancias.forEach((di) => {
        if (oi.routeId === di.routeId) return
        LUGARES.forEach((lugarT) => {
          const instA = lugarT.instancias.find((x) => x.routeId === oi.routeId)
          const instB = lugarT.instancias.find((x) => x.routeId === di.routeId)
          if (!instA || !instB) return
          const rutaA = obtenerRuta(oi.routeId)
          const rutaB = obtenerRuta(di.routeId)
          const min1 = minutosEntreEnRuta(rutaA, oi.codigo, instA.codigo)
          const min2 = minutosEntreEnRuta(rutaB, instB.codigo, di.codigo)
          if (min1 == null || min2 == null) return
          const minutos = min1 + min2
          if (!mejorTransbordo || minutos < mejorTransbordo.minutos) {
            mejorTransbordo = {
              tipo: 'transbordo',
              ruta1: rutaA,
              ruta2: rutaB,
              origen: { nombre: origen.nombre, codigo: oi.codigo },
              transbordo: { nombre: lugarT.nombre, codigo1: instA.codigo, codigo2: instB.codigo },
              destino: { nombre: destino.nombre, codigo: di.codigo },
              minutos1: min1,
              minutos2: min2,
              minutos,
            }
          }
        })
      })
    })
    return mejorTransbordo || null
  }

  function obtenerCoordenadaParada(routeId, codigo) {
    const ruta = obtenerRuta(routeId)
    if (!ruta) return null
    const g = construirGeometriaAproximada(ruta)
    const p = g.paradas.find((x) => x.codigo === codigo)
    return p ? [p.lat, p.lng] : null
  }

  return {
    rutas,
    obtenerRuta,
    LUGARES,
    RUTA_A_LUGARES,
    conexionesDe,
    geometriaAproximadaConConexiones,
    geometriaRealConConexiones,
    obtenerCoordenadaParada,
    planificarViaje,
  }
}
