// Datos de rutas basados en el sistema real de trolleys de Vega Baja
// ("MOVICI" - transportevb.com), usados como base mientras se define el
// itinerario definitivo de Vega Alta.
//
// Cada parada tiene un nombre y, cuando se pudo confirmar en Google Maps,
// coordenadas reales ("ancla"). Las paradas sin ancla (calles/sectores
// residenciales que no aparecen como lugares en Maps) se ubican por
// INTERPOLACIÓN: se calculan a lo largo de la línea entre la parada
// ancla anterior y la siguiente, según el orden publicado de la ruta.
// Esto da una posición aproximada, no una traza exacta calle por calle.
//
// El tiempo estimado de llegada a cada parada NO se calcula con un
// horario fijo: se calcula en vivo según la distancia real entre la
// posición GPS del chofer y cada parada, siguiendo el orden de la ruta.

// ---- Puntos ancla reales (confirmados en Google Maps) ----
const TERMINAL = [18.4446, -66.3895] // Terminal HJS y Plaza del Mercado
const ESTACION_TREN = [18.449, -66.387] // Antigua Estación del Tren
const BELLAS_ARTES = [18.4459, -66.3878] // Esc. Bellas Artes
const PLAZA_VEGA_BAJA = [18.4444, -66.3777] // Plaza Vega Baja (mall)
const UNIV_CARIBE = [18.4445, -66.4036] // Caribbean University
const HOSPITAL = [18.4467, -66.3993] // Hospital Wilma N. Vázquez
const LAS_VEGAS_MALL = [18.4456, -66.3961] // Plaza Las Vegas Mall
const PEREZ_MELON = [18.4442, -66.3965] // Centro Pérez Melón
const BALNEARIO_PN = [18.4913, -66.3987] // Balneario Puerto Nuevo
const LAGUNA_TORTUGUERO = [18.4635, -66.4435] // Laguna Tortuguero
const PLAZA_JARDINES = [18.4461, -66.4048] // Plaza Jardines Mall
const VIATRIS = [18.4506, -66.3506] // Viatris Pharmaceutical
const ESTADIO_CRB = [18.4487, -66.3934] // Estadio/Parque Carlos Román Brull
const BARRIADA_SANDIN = [18.482, -66.4162] // Barriada Sandín
const PUEBLO_NUEVO = [18.4378, -66.3525] // Pueblo Nuevo
const EL_CRIOLLO = [18.4471, -66.4004] // Sector El Criollo
const PUGNADO = [18.3857, -66.4331] // Bo. Pugnado Adentro
const ALMIRANTE = [18.3763, -66.3825] // Bo. Almirante Sur
const PARCELAS_AMADEO = [18.4318, -66.4086] // Parcelas Amadeo
const QUEBRADA_ARENAS = [18.3794, -66.4063] // Quebrada Arenas

// offset: posición relativa dentro del orden de la ruta (no es tiempo,
// es solo para saber en qué proporción interpolar entre dos anclas).
export const ROUTES = [
  {
    id: 'ruta-1-alturas',
    nombre: 'Ruta 1 - Alturas',
    color: '#e85d4e',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '102', nombre: 'Antigua Estación del Tren', offset: 6, ancla: ESTACION_TREN },
      { codigo: '103', nombre: 'Esc. Bellas Artes / Zona Bancaria', offset: 8, ancla: BELLAS_ARTES },
      { codigo: '104', nombre: 'Plaza Vega Baja / Centro Comercial', offset: 12, ancla: PLAZA_VEGA_BAJA },
      { codigo: '105', nombre: 'La Trocha / Dr. Paz', offset: 13 },
      { codigo: '106', nombre: 'Ave. Trío Vegabajeño', offset: 14 },
      { codigo: '107', nombre: 'Urb. Vista Verde / Los Hucares', offset: 15 },
      { codigo: '108', nombre: 'Urb. El Rosario / Sup. El Mango', offset: 17 },
      { codigo: '109', nombre: 'Urb. Vega Serena', offset: 19 },
      { codigo: '110', nombre: 'CDT', offset: 20 },
      { codigo: '111', nombre: 'Río Abajo / Entrada', offset: 22 },
      { codigo: '112', nombre: 'Urb. El Rosario / Parque', offset: 24 },
      { codigo: '113', nombre: 'Urb. Alturas / Esc. JQM', offset: 26 },
      { codigo: '114', nombre: 'Urb. Alturas / Colmado Vega', offset: 29 },
      { codigo: '115', nombre: 'Urb. Alturas / Parque', offset: 31 },
      { codigo: '116', nombre: 'Urb. Alturas / Los Mandriles', offset: 32 },
      { codigo: '117', nombre: "V'Soske", offset: 34 },
      { codigo: '120', nombre: 'Univ. del Caribe / El Criollo', offset: 36, ancla: UNIV_CARIBE },
      { codigo: '121', nombre: 'Hospital Wilma Vázquez', offset: 37, ancla: HOSPITAL },
      { codigo: '122', nombre: 'Plaza Las Vegas Mall / Carr. 2', offset: 38, ancla: LAS_VEGAS_MALL },
      { codigo: '123', nombre: 'Plaza Las Vegas Mall / Carr. 155', offset: 39 },
      { codigo: '124', nombre: 'Centro Pérez Melón', offset: 39, ancla: PEREZ_MELON },
      { codigo: '125', nombre: 'Urb. El Verde / Bo. Pugnado', offset: 40 },
      { codigo: '101f', nombre: 'Terminal HJS (regreso)', offset: 41, ancla: TERMINAL },
    ],
  },
  {
    id: 'ruta-2-playa',
    nombre: 'Ruta 2 - Playa',
    color: '#1e8e8f',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '102', nombre: 'Esc. Bellas Artes', offset: 4, ancla: BELLAS_ARTES },
      { codigo: '103', nombre: 'Antigua Estación del Tren', offset: 9, ancla: ESTACION_TREN },
      { codigo: '204', nombre: 'Villa Real / Farmacia', offset: 11 },
      { codigo: '205', nombre: 'Urb. San Vicente / Zona Industrial', offset: 12 },
      { codigo: '206', nombre: 'Los Naranjos', offset: 15 },
      { codigo: '207', nombre: 'Las Lisas', offset: 17 },
      { codigo: '208', nombre: 'Balneario Puerto Nuevo / Malecón', offset: 18, ancla: BALNEARIO_PN },
      { codigo: '210', nombre: 'Urb. San Demetrio / Malecón', offset: 21 },
      { codigo: '211', nombre: 'Urb. San Demetrio / Econo', offset: 24 },
      { codigo: '212', nombre: 'Barriada Sandín / Carr. Venus', offset: 25, ancla: BARRIADA_SANDIN },
      { codigo: '215', nombre: 'Beach Chalets / Beach Villas', offset: 29 },
      { codigo: '218', nombre: 'Urb. Ocean Front', offset: 33 },
      { codigo: '220', nombre: 'Guarico Viejo', offset: 35 },
      { codigo: '221', nombre: 'Laguna Tortuguero', offset: 36, ancla: LAGUNA_TORTUGUERO },
      { codigo: '223', nombre: 'Urb. Ciudad Real / Guardia Nacional', offset: 37 },
      { codigo: '225', nombre: 'Los Jardines / Carr. 2', offset: 40 },
      { codigo: '226', nombre: 'El Criollo / Carr. 2', offset: 41, ancla: EL_CRIOLLO },
      { codigo: '121', nombre: 'Hospital Wilma Vázquez', offset: 43, ancla: HOSPITAL },
      { codigo: '122', nombre: 'Plaza Las Vegas Mall / Carr. 2', offset: 44, ancla: LAS_VEGAS_MALL },
      { codigo: '123', nombre: 'Plaza Las Vegas Mall / Carr. 155', offset: 47 },
    ],
  },
  {
    id: 'ruta-3-pugnado',
    nombre: 'Ruta 3 - Pugnado',
    color: '#8a6d3b',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '302', nombre: 'Centro Pérez Melón (oeste)', offset: 2, ancla: PEREZ_MELON },
      { codigo: '123', nombre: 'Plaza Las Vegas Mall / Carr. 155', offset: 3, ancla: LAS_VEGAS_MALL },
      { codigo: '304', nombre: 'El Criollo / Carr. 155', offset: 4, ancla: EL_CRIOLLO },
      { codigo: '305', nombre: 'Amadeo / Mech-Tech', offset: 6, ancla: PARCELAS_AMADEO },
      { codigo: '306', nombre: 'Las Granjas / Carr. Inocencio Rey', offset: 8 },
      { codigo: '307', nombre: 'Amadeo / Carr. E', offset: 12 },
      { codigo: '308', nombre: 'Los Martínez / Hacienda El Payaso', offset: 14 },
      { codigo: '309', nombre: 'Bartolo Joy / Carr. 645', offset: 19 },
      { codigo: '310', nombre: 'Quebrada Arenas / Cuesta Blanca', offset: 21, ancla: QUEBRADA_ARENAS },
      { codigo: '311', nombre: 'Quebrada Arenas / Rabo del Buey', offset: 24 },
      { codigo: '312', nombre: 'Bo. Pugnado / Carr. M. Maldonado', offset: 30, ancla: PUGNADO },
      { codigo: '314', nombre: 'El Cruce', offset: 33 },
      { codigo: '316', nombre: 'Franquez / Carr. 634', offset: 36 },
      { codigo: '318', nombre: 'Colombo / Carr. 137', offset: 40 },
      { codigo: '318b', nombre: 'Amadeo / Carr. Lino Padrón', offset: 46, ancla: PARCELAS_AMADEO },
      { codigo: '321', nombre: 'Urb. Alturas / Michael Sea Food', offset: 50, ancla: UNIV_CARIBE },
      { codigo: '123b', nombre: 'Plaza Las Vegas Mall (regreso)', offset: 52, ancla: LAS_VEGAS_MALL },
      { codigo: '124', nombre: 'Centro Pérez Melón (este)', offset: 53, ancla: PEREZ_MELON },
      { codigo: '101f', nombre: 'Terminal HJS (regreso)', offset: 55, ancla: TERMINAL },
    ],
  },
  {
    id: 'ruta-4-almirante',
    nombre: 'Ruta 4 - Almirante',
    color: '#f2a93b',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '103', nombre: 'Esc. Bellas Artes / Zona Bancaria', offset: 5, ancla: BELLAS_ARTES },
      { codigo: '104', nombre: 'Plaza Vega Baja / Centro Comercial', offset: 7, ancla: PLAZA_VEGA_BAJA },
      { codigo: '404', nombre: 'Arenales / Carretera', offset: 8 },
      { codigo: '406', nombre: 'Sector La India', offset: 9 },
      { codigo: '408', nombre: 'Sector Hard Rock', offset: 11 },
      { codigo: '410', nombre: 'Sector CP', offset: 13 },
      { codigo: '412', nombre: 'Las Arraiza', offset: 15 },
      { codigo: '416', nombre: 'Sector Los Jets', offset: 17 },
      { codigo: '418', nombre: 'Parcelas Miranda', offset: 21 },
      { codigo: '420', nombre: 'La Cooperativa', offset: 23 },
      { codigo: '422', nombre: 'Sector Los Rodríguez', offset: 26 },
      { codigo: '423', nombre: 'La Gallera / Charco Azul', offset: 27, ancla: ALMIRANTE },
      { codigo: '425', nombre: 'La Línea', offset: 32 },
      { codigo: '426', nombre: 'Área Recreativa El Trece', offset: 35 },
      { codigo: '101f', nombre: 'Terminal HJS (regreso)', offset: 60, ancla: TERMINAL },
    ],
  },
  {
    id: 'ruta-5-este',
    nombre: 'Ruta 5 - Este',
    color: '#146c6e',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '502', nombre: 'Urb. Monte Carlo / Manejo de Emergencias', offset: 2 },
      { codigo: '104', nombre: 'Plaza Vega Baja / Centro Comercial', offset: 6, ancla: PLAZA_VEGA_BAJA },
      { codigo: '506', nombre: 'Pueblo Nuevo / Calle 9', offset: 10, ancla: PUEBLO_NUEVO },
      { codigo: '509', nombre: 'Pueblo Nuevo / Calles 1 y 4', offset: 18 },
      { codigo: '511', nombre: 'Carmelita / Calle Pavo Real', offset: 21 },
      { codigo: '513', nombre: 'Carmelita / Cristo y Carmelita', offset: 26 },
      { codigo: '514', nombre: 'Farmacéutica Viatris', offset: 27, ancla: VIATRIS },
      { codigo: '516', nombre: 'Sabana / Calle 8', offset: 31 },
      { codigo: '519', nombre: 'Cooperativa de Manatí', offset: 37 },
      { codigo: '102', nombre: 'Antigua Estación del Tren', offset: 39, ancla: ESTACION_TREN },
      { codigo: '522', nombre: 'Urb. Las Flores', offset: 41 },
      { codigo: '523', nombre: 'Parque Carlos Román Brull', offset: 42, ancla: ESTADIO_CRB },
      { codigo: '101f', nombre: 'Terminal HJS (regreso)', offset: 45, ancla: TERMINAL },
    ],
  },
  {
    id: 'ruta-6-oeste',
    nombre: 'Ruta 6 - Oeste',
    color: '#7a4fb5',
    paradas: [
      { codigo: '101', nombre: 'Terminal HJS y Plaza del Mercado', offset: 0, ancla: TERMINAL },
      { codigo: '602', nombre: 'Urb. Monte Carlos', offset: 3 },
      { codigo: '604', nombre: 'Sector Ojo de Agua', offset: 6 },
      { codigo: '605', nombre: 'Plaza Jardines Mall', offset: 8, ancla: PLAZA_JARDINES },
      { codigo: '607', nombre: 'Tortuguero / Gasolinera', offset: 13 },
      { codigo: '609', nombre: 'Colombo / Parque', offset: 19 },
      { codigo: '611', nombre: 'Parc. Márquez / Calle Ceiba', offset: 21 },
      { codigo: '613', nombre: 'Vega Cast', offset: 25 },
      { codigo: '615', nombre: 'Lagos de Vega Baja / Calle 6', offset: 33 },
      { codigo: '617', nombre: 'Urb. Estancias de Tortuguero', offset: 37 },
      { codigo: '619', nombre: 'Laboratorio Clínico Del Mar', offset: 40 },
      { codigo: '621', nombre: 'Urb. Jardines / Carr. 2', offset: 44 },
      { codigo: '120', nombre: 'Univ. del Caribe / El Criollo', offset: 46, ancla: UNIV_CARIBE },
      { codigo: '122', nombre: 'Plaza Las Vegas Mall / Carr. 2', offset: 49, ancla: LAS_VEGAS_MALL },
      { codigo: '101f', nombre: 'Terminal HJS (regreso)', offset: 52, ancla: TERMINAL },
    ],
  },
]

export function obtenerRuta(id) {
  return ROUTES.find((r) => r.id === id) || null
}

// ---------- Geometría: interpolar coordenadas + distancias ----------

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

// Devuelve las paradas de una ruta con coordenadas [lat,lng] completas
// (las que no tenían ancla se ubican por interpolación lineal entre la
// ancla anterior y la siguiente), más la distancia acumulada en km
// desde la primera parada hasta cada una (siguiendo el orden de la ruta).
export function construirGeometria(ruta) {
  const paradas = ruta.paradas
  const anclaIdx = paradas
    .map((p, i) => (p.ancla ? i : -1))
    .filter((i) => i !== -1)

  const coords = paradas.map((p, i) => {
    if (p.ancla) return p.ancla
    const prevIdx = [...anclaIdx].reverse().find((a) => a < i)
    const nextIdx = anclaIdx.find((a) => a > i)
    if (prevIdx === undefined && nextIdx === undefined) return TERMINAL
    if (prevIdx === undefined) return paradas[nextIdx].ancla
    if (nextIdx === undefined) return paradas[prevIdx].ancla
    const prevP = paradas[prevIdx]
    const nextP = paradas[nextIdx]
    const total = nextP.offset - prevP.offset || 1
    const t = (p.offset - prevP.offset) / total
    return [
      prevP.ancla[0] + (nextP.ancla[0] - prevP.ancla[0]) * t,
      prevP.ancla[1] + (nextP.ancla[1] - prevP.ancla[1]) * t,
    ]
  })

  let acumulada = 0
  const paradasConGeo = paradas.map((p, i) => {
    if (i > 0) acumulada += haversineKm(coords[i - 1], coords[i])
    return { ...p, lat: coords[i][0], lng: coords[i][1], distanciaKm: acumulada }
  })

  return { ...ruta, paradas: paradasConGeo, distanciaTotalKm: acumulada }
}

// Dada la geometría de una ruta y la posición actual del chofer,
// calcula cuánto ha avanzado (en km) sobre la línea de la ruta,
// proyectando su posición sobre el segmento más cercano.
function proyectarSobreRuta(paradasGeo, posicion) {
  let mejorDist = Infinity
  let mejorAcumulada = 0

  for (let i = 0; i < paradasGeo.length - 1; i++) {
    const a = paradasGeo[i]
    const b = paradasGeo[i + 1]
    const segLenKm = b.distanciaKm - a.distanciaKm || 0.0001

    const ax = a.lng,
      ay = a.lat,
      bx = b.lng,
      by = b.lat
    const px = posicion.lng,
      py = posicion.lat
    const abx = bx - ax,
      aby = by - ay
    const apx = px - ax,
      apy = py - ay
    const lenSq = abx * abx + aby * aby || 0.0000001
    let t = (apx * abx + apy * aby) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projLat = ay + aby * t
    const projLng = ax + abx * t
    const dist = haversineKm([posicion.lat, posicion.lng], [projLat, projLng])

    if (dist < mejorDist) {
      mejorDist = dist
      mejorAcumulada = a.distanciaKm + segLenKm * t
    }
  }
  return { distanciaAlChofer: mejorDist, progresoKm: mejorAcumulada }
}

// Calcula, para cada parada de la ruta, la distancia restante y el
// tiempo estimado de llegada según la posición GPS actual del chofer.
// velocidadKmh: velocidad promedio asumida (incluye paradas y tráfico
// urbano ligero).
export function calcularLlegadasPorDistancia(
  ruta,
  posicionChofer,
  velocidadKmh = 18
) {
  const geo = construirGeometria(ruta)
  const { progresoKm } = proyectarSobreRuta(geo.paradas, posicionChofer)

  const paradasConEta = geo.paradas.map((p) => {
    let restanteKm = p.distanciaKm - progresoKm
    let vuelta = false
    if (restanteKm < -0.05) {
      restanteKm += geo.distanciaTotalKm
      vuelta = true
    }
    const minutos = Math.max(0, Math.round((restanteKm / velocidadKmh) * 60))
    return { ...p, restanteKm, minutos, vuelta }
  })

  const proxima = [...paradasConEta]
    .filter((p) => p.restanteKm > 0.06)
    .sort((a, b) => a.restanteKm - b.restanteKm)[0]

  return {
    color: ruta.color,
    distanciaTotalKm: geo.distanciaTotalKm,
    paradas: paradasConEta,
    proximaCodigo: proxima?.codigo,
  }
}

// Lista simple [lat,lng] para dibujar la línea de la ruta en el mapa.
export function obtenerTrazado(ruta) {
  const geo = construirGeometria(ruta)
  return geo.paradas.map((p) => [p.lat, p.lng])
}
