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

function elEl(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.firstElementChild
}

export default function PassengerMap() {
  const [choferes, setChoferes] = useState({})
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null)
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

  const rutaMostrada = rutaSeleccionada
    ? obtenerRuta(rutaSeleccionada)
    : ROUTES.find((r) => idsConServicio.has(r.id)) || ROUTES[0]

  const choferDeRutaMostrada = rutaMostrada
    ? activos.find((c) => c.ruta === rutaMostrada.id)
    : null

  const geometria = useGeometriaRuta(rutaMostrada)

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
        paint: {
          'line-color': '#146c6e',
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

  // ---- Dibuja/actualiza la línea de la ruta y encuadra el mapa ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return
    const fuente = map.getSource('ruta-trazado')
    if (!geometria) {
      fuente?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } })
      return
    }
    const coords = geometria.geometry.map(([lat, lng]) => [lng, lat])
    fuente?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
    map.setPaintProperty('ruta-trazado-linea', 'line-color', rutaMostrada.color)

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    )
    map.fitBounds(bounds, { padding: 48, duration: 600 })
  }, [geometria, rutaMostrada, mapaListo])

  // ---- Marcadores de paradas ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return

    // limpia marcadores anteriores
    marcadoresParadaRef.current.forEach((m) => m.marker.remove())
    marcadoresParadaRef.current.clear()

    if (!listaParadas.length) return

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
  }, [listaParadas, proximaCodigo, paradaSeleccionada, rutaMostrada, mapaListo])

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

  // ---- Marcadores de trolleys en vivo ----
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

    // quita los que ya no están activos
    marcadoresTrolleyRef.current.forEach((entry, uid) => {
      if (!vistos.has(uid)) {
        entry.marker.remove()
        marcadoresTrolleyRef.current.delete(uid)
      }
    })
  }, [activos, mapaListo])

  return (
    <div className="screen no-pad">
      <div className="route-tabs">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            className={rutaMostrada?.id === r.id ? 'active' : ''}
            style={{ '--tab-color': r.color }}
            onClick={() => elegirRuta(r.id)}
          >
            {idsConServicio.has(r.id) && <span className="tab-live-dot" />}
            {r.nombre.replace('Ruta ', 'R')}
          </button>
        ))}
      </div>

      <div className="map-wrap">
        <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />
      </div>

      {geometria && (
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

