import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { onValue, ref } from 'firebase/database'
import { db } from '../firebase'
import {
  ROUTES,
  obtenerRuta,
  construirGeometriaAproximada,
  construirGeometriaReal,
  calcularLlegadasPorDistancia,
} from '../data/routesVegaBaja'

// Centro aproximado del mapa (ajusta esto cuando tengas las coordenadas
// reales de Vega Alta / tu municipio). MapLibre usa [lng, lat].
const CENTRO_MAPA = [-66.3944, 18.413]

// Estilo de mapa vectorial gratuito, sin llave y sin límite de uso
// (OpenFreeMap). Da el look "Google Maps / Waze" sin depender de un
// proveedor de pago.
const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty'

// Hook: carga la geometría de una ruta. Muestra de inmediato la versión
// aproximada (línea recta entre puntos conocidos) y, en cuanto el
// servicio de rutas responde, la reemplaza por la real (siguiendo
// carreteras). Si el servicio falla (sin internet, etc.) se queda con
// la aproximada.
function useGeometriaRuta(ruta) {
  const [geometria, setGeometria] = useState(null)

  useEffect(() => {
    if (!ruta) {
      setGeometria(null)
      return
    }
    setGeometria(construirGeometriaAproximada(ruta))
    let cancelado = false
    construirGeometriaReal(ruta)
      .then((real) => {
        if (!cancelado) setGeometria(real)
      })
      .catch(() => {
        // se queda con la aproximada, no pasa nada
      })
    return () => {
      cancelado = true
    }
  }, [ruta])

  return geometria
}

// Hook: carga la geometría de TODAS las rutas a la vez (para el modo
// "Todas las rutas"). Cada una empieza en su versión aproximada y se
// va actualizando a la real conforme responde el servicio de rutas.
// Como construirGeometriaReal cachea por ruta, esto no vuelve a pedir
// nada si el pasajero ya había visto esa ruta individualmente.
function useGeometriasTodas() {
  const [geometrias, setGeometrias] = useState(() =>
    Object.fromEntries(ROUTES.map((r) => [r.id, construirGeometriaAproximada(r)]))
  )

  useEffect(() => {
    let cancelado = false
    ROUTES.forEach((r) => {
      construirGeometriaReal(r)
        .then((real) => {
          if (!cancelado) setGeometrias((prev) => ({ ...prev, [r.id]: real }))
        })
        .catch(() => {})
    })
    return () => {
      cancelado = true
    }
  }, [])

  return geometrias
}

function elEl(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.firstElementChild
}

export default function PassengerMap() {
  const [choferes, setChoferes] = useState({})
  const [rutaSeleccionada, setRutaSeleccionada] = useState('todas')
  const [paradaSeleccionada, setParadaSeleccionada] = useState(null)

  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const mapListoRef = useRef(false)
  const marcadoresParadaRef = useRef(new Map())
  const marcadoresTrolleyRef = useRef(new Map())

  useEffect(() => {
    const choferesRef = ref(db, 'choferesActivos')
    const unsub = onValue(choferesRef, (snap) => {
      setChoferes(snap.exists() ? snap.val() : {})
    })
    return unsub
  }, [])

  const activos = useMemo(
    () =>
      Object.entries(choferes)
        .map(([uid, c]) => ({ uid, ...c }))
        .filter((c) => c.activo && c.lat && c.lng),
    [choferes]
  )

  const idsConServicio = useMemo(
    () => new Set(activos.map((c) => c.ruta).filter(Boolean)),
    [activos]
  )

  const modoTodas = rutaSeleccionada === 'todas'
  const rutaMostrada = modoTodas ? null : obtenerRuta(rutaSeleccionada)

  const choferDeRutaMostrada = rutaMostrada
    ? activos.find((c) => c.ruta === rutaMostrada.id)
    : null

  const geometria = useGeometriaRuta(rutaMostrada)
  const geometriasTodas = useGeometriasTodas()

  const llegadas = useMemo(() => {
    if (!geometria || !choferDeRutaMostrada) return null
    return calcularLlegadasPorDistancia(geometria, {
      lat: choferDeRutaMostrada.lat,
      lng: choferDeRutaMostrada.lng,
    })
  }, [geometria, choferDeRutaMostrada])

  // Si no hay chofer activo en esta ruta, igual mostramos sus paradas
  // (para que el pasajero pueda ver el recorrido), pero con tiempo N/A.
  const listaParadas = useMemo(() => {
    if (llegadas) return llegadas.paradas
    if (!geometria) return []
    return geometria.paradas.map((p) => ({ ...p, minutos: null, vuelta: false }))
  }, [llegadas, geometria])

  const proximaCodigo = llegadas?.proximaCodigo ?? null

  function elegirRuta(id) {
    setRutaSeleccionada(id)
    setParadaSeleccionada(null)
  }

  function elegirParada(codigo) {
    setParadaSeleccionada((actual) => (actual === codigo ? null : codigo))
  }

  const [mapaListo, setMapaListo] = useState(false)

  // ---- Crea el mapa una sola vez ----
  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapDivRef.current,
      style: ESTILO_MAPA,
      center: CENTRO_MAPA,
      zoom: 12,
      attributionControl: true,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')
    map.on('load', () => {
      map.addSource('ruta-trazado', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: 'ruta-trazado-linea',
        type: 'line',
        source: 'ruta-trazado',
        paint: { 'line-color': '#146c6e', 'line-width': 4, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      map.addSource('todas-rutas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'todas-rutas-linea',
        type: 'line',
        source: 'todas-rutas',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.8,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      mapListoRef.current = true
      mapRef.current = map
      // fuerza un re-render leve para que los efectos que dependen de
      // mapListoRef puedan correr
      setMapaListo(true)
    })
    return () => {
      map.remove()
      mapRef.current = null
      mapListoRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Dibuja/actualiza la línea de UNA ruta y encuadra el mapa ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return
    const fuenteUna = map.getSource('ruta-trazado')
    const fuenteTodas = map.getSource('todas-rutas')
    if (modoTodas || !geometria) {
      fuenteUna?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } })
      return
    }
    fuenteTodas?.setData({ type: 'FeatureCollection', features: [] })

    const coords = geometria.geometry.map(([lat, lng]) => [lng, lat])
    fuenteUna?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
    map.setPaintProperty('ruta-trazado-linea', 'line-color', rutaMostrada.color)

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    )
    map.fitBounds(bounds, { padding: 48, duration: 600 })
  }, [geometria, rutaMostrada, modoTodas, mapaListo])

  // ---- Dibuja TODAS las rutas a la vez, cada una de su color ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current || !modoTodas) return

    const features = ROUTES.map((r) => {
      const g = geometriasTodas[r.id]
      return {
        type: 'Feature',
        properties: { color: r.color, id: r.id },
        geometry: {
          type: 'LineString',
          coordinates: (g?.geometry || []).map(([lat, lng]) => [lng, lat]),
        },
      }
    })

    map.getSource('todas-rutas')?.setData({ type: 'FeatureCollection', features })

    const todosLosPuntos = features.flatMap((f) => f.geometry.coordinates)
    if (todosLosPuntos.length) {
      const bounds = todosLosPuntos.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(todosLosPuntos[0], todosLosPuntos[0])
      )
      map.fitBounds(bounds, { padding: 40, duration: 600 })
    }
  }, [modoTodas, geometriasTodas, mapaListo])

  // ---- Marcadores de paradas (solo en modo de una ruta) ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return

    marcadoresParadaRef.current.forEach((m) => m.marker.remove())
    marcadoresParadaRef.current.clear()

    if (modoTodas || !listaParadas.length) return

    listaParadas.forEach((p) => {
      const esSeleccionada = p.codigo === paradaSeleccionada
      const esProxima = p.codigo === proximaCodigo
      const esConexion = p.conexiones && p.conexiones.length > 0
      const base = esSeleccionada ? 20 : esProxima ? 16 : esConexion ? 15 : 10
      const forma = esConexion ? '30%' : '50%'
      const relleno = esProxima || esSeleccionada ? rutaMostrada.color : '#fff'
      const colorIcono = esProxima || esSeleccionada ? '#fff' : rutaMostrada.color
      const el = elEl(`
        <div style="
          width:${base}px;height:${base}px;border-radius:${forma};
          background:${relleno};
          border:${esSeleccionada ? 3 : 2}px solid ${esSeleccionada ? '#17262a' : rutaMostrada.color};
          box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;
          display:flex;align-items:center;justify-content:center;
          font-size:${Math.round(base * 0.62)}px;line-height:1;color:${colorIcono};
          transform:${esConexion ? 'rotate(45deg)' : 'none'};
        ">${esConexion ? `<span style="transform:rotate(-45deg)">⇄</span>` : ''}</div>
      `)
      el.addEventListener('click', () => elegirParada(p.codigo))

      const conexionesHtml = esConexion
        ? `<div style="margin-top:6px;font-size:0.78rem;color:#4a5c5f;">
             🔀 También pasa: ${p.conexiones.map((r) => r.nombre).join(', ')}
           </div>`
        : ''

      const etaHtml =
        p.minutos == null
          ? 'N/A (sin chofer activo)'
          : p.vuelta
          ? `~${p.minutos} min (próxima vuelta)`
          : `~${p.minutos} min`

      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setHTML(`
        <div class="popup-card">
          <b>${p.nombre}</b><br/>
          ${etaHtml}
          ${conexionesHtml}
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map)

      marcadoresParadaRef.current.set(p.codigo, { marker, popup, lng: p.lng, lat: p.lat })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaParadas, proximaCodigo, paradaSeleccionada, rutaMostrada, modoTodas, mapaListo])

  // ---- Centra el mapa y abre el popup al elegir una parada ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current || !paradaSeleccionada) return
    const entry = marcadoresParadaRef.current.get(paradaSeleccionada)
    if (!entry) return
    map.flyTo({
      center: [entry.lng, entry.lat],
      zoom: Math.max(map.getZoom(), 16),
      duration: 600,
    })
    entry.marker.togglePopup()
  }, [paradaSeleccionada, mapaListo])

  // ---- Marcadores de trolleys en vivo (siempre, en cualquier modo) ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return

    const vistos = new Set()
    activos.forEach((c) => {
      vistos.add(c.uid)
      const ruta = obtenerRuta(c.ruta)
      const existente = marcadoresTrolleyRef.current.get(c.uid)
      if (existente) {
        existente.marker.setLngLat([c.lng, c.lat])
        existente.popup.setHTML(popupTrolleyHtml(ruta, c))
      } else {
        const el = elEl(`<div class="trolley-marker"><span>🚋</span></div>`)
        const popup = new maplibregl.Popup({ offset: 20 }).setHTML(popupTrolleyHtml(ruta, c))
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.lng, c.lat])
          .setPopup(popup)
          .addTo(map)
        marcadoresTrolleyRef.current.set(c.uid, { marker, popup })
      }
    })

    marcadoresTrolleyRef.current.forEach((entry, uid) => {
      if (!vistos.has(uid)) {
        entry.marker.remove()
        marcadoresTrolleyRef.current.delete(uid)
      }
    })
  }, [activos, mapaListo])

  return (
    <div className="screen no-pad">
      <div className="route-select-wrap">
        <select
          className="route-select"
          value={rutaSeleccionada}
          onChange={(e) => elegirRuta(e.target.value)}
        >
          <option value="todas">🗺️ Todas las rutas</option>
          {ROUTES.map((r) => (
            <option key={r.id} value={r.id}>
              {idsConServicio.has(r.id) ? '🟢 ' : ''}
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="map-wrap">
        <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />
      </div>

      {modoTodas && (
        <div className="stops-panel">
          <div className="stops-panel-header">Leyenda de rutas</div>
          <div className="route-legend-list">
            {ROUTES.map((r) => (
              <div
                key={r.id}
                className="route-legend-row"
                onClick={() => elegirRuta(r.id)}
                role="button"
                tabIndex={0}
              >
                <span className="stop-dot" style={{ background: r.color }} />
                <span className="stop-name">{r.nombre}</span>
                {idsConServicio.has(r.id) ? (
                  <span className="stop-eta" style={{ color: '#1e8e6f', fontWeight: 700 }}>
                    En servicio
                  </span>
                ) : (
                  <span className="stop-eta">Sin servicio</span>
                )}
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 4px' }}>
            Toca una ruta para ver sus paradas y tiempos estimados.
          </p>
        </div>
      )}

      {!modoTodas && geometria && (
        <div className="stops-panel">
          <div className="stops-panel-header" style={{ color: rutaMostrada.color }}>
            {rutaMostrada.nombre}
            {choferDeRutaMostrada && ` — ${choferDeRutaMostrada.nombre}`}
          </div>

          {!choferDeRutaMostrada && (
            <div className="no-service-banner">
              🚫 No hay ningún trolley activo en esta ruta ahora mismo. Los
              tiempos se muestran como N/A.
            </div>
          )}

          {geometria.esAproximada && (
            <p className="hint" style={{ padding: '0 4px', marginTop: 0 }}>
              Cargando trazado real por carreteras…
            </p>
          )}

          <div className="stops-list">
            {listaParadas.map((p) => (
              <div
                key={p.codigo}
                className={
                  'stop-row' +
                  (p.codigo === proximaCodigo ? ' next' : '') +
                  (p.codigo === paradaSeleccionada ? ' selected' : '')
                }
                onClick={() => elegirParada(p.codigo)}
                role="button"
                tabIndex={0}
              >
                <span className="stop-dot" style={{ background: rutaMostrada.color }} />
                <span className="stop-name">
                  {p.nombre}
                  {p.conexiones?.length > 0 && (
                    <span
                      className="transfer-badge"
                      title={`También pasa: ${p.conexiones.map((r) => r.nombre).join(', ')}`}
                    >
                      ⇄ {p.conexiones.length > 1 ? `${p.conexiones.length} rutas` : p.conexiones[0].nombre.replace('Ruta ', 'R')}
                    </span>
                  )}
                </span>
                <span className="stop-eta">
                  {p.minutos == null ? 'N/A' : p.minutos <= 0 ? 'Aquí' : `${p.minutos} min`}
                  {p.vuelta ? ' *' : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 4px' }}>
            Tiempos estimados según la posición GPS actual del chofer y la
            distancia real por carretera a cada parada (no es un horario
            fijo). * = próxima vuelta. ⇄ = punto de transbordo (ahí puedes
            tomar otro trolley). Toca una parada para verla en el mapa.
          </p>
        </div>
      )}
    </div>
  )
}

function popupTrolleyHtml(ruta, c) {
  return `
    <div class="popup-card">
      <b>${ruta?.nombre || 'Trolley'}</b><br/>
      Chofer: ${c.nombre}
    </div>
  `
}
