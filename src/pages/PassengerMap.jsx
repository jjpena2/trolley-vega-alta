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

  const rutasActivas = useMemo(() => {
    const ids = new Set(activos.map((c) => c.ruta).filter(Boolean))
    return ROUTES.filter((r) => ids.has(r.id))
  }, [activos])

  const rutaMostrada = rutaSeleccionada
    ? obtenerRuta(rutaSeleccionada)
    : rutasActivas[0] || null

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

  function elegirRuta(id) {
    setRutaSeleccionada(id)
    setParadaSeleccionada(null)
  }

  function elegirParada(codigo) {
    setParadaSeleccionada((actual) => (actual === codigo ? null : codigo))
  }

  const [, setMapaListo] = useState(false)

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
  }, [geometria, rutaMostrada])

  // ---- Marcadores de paradas ----
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapListoRef.current) return

    // limpia marcadores anteriores
    marcadoresParadaRef.current.forEach((m) => m.marker.remove())
    marcadoresParadaRef.current.clear()

    if (!llegadas) return

    llegadas.paradas.forEach((p) => {
      const esSeleccionada = p.codigo === paradaSeleccionada
      const esProxima = p.codigo === llegadas.proximaCodigo
      const tamano = esSeleccionada ? 20 : esProxima ? 16 : 10
      const el = elEl(`
        <div style="
          width:${tamano}px;height:${tamano}px;border-radius:50%;
          background:${esProxima || esSeleccionada ? rutaMostrada.color : '#fff'};
          border:${esSeleccionada ? 3 : 2}px solid ${esSeleccionada ? '#17262a' : rutaMostrada.color};
          box-shadow:0 2px 6px rgba(0,0,0,0.25);cursor:pointer;
        "></div>
      `)
      el.addEventListener('click', () => elegirParada(p.codigo))

      const popup = new maplibregl.Popup({ offset: 12, closeButton: true }).setHTML(`
        <div class="popup-card">
          <b>${p.nombre}</b><br/>
          ${p.vuelta ? `~${p.minutos} min (próxima vuelta)` : `~${p.minutos} min`}
        </div>
      `)

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([p.lng, p.lat])
        .setPopup(popup)
        .addTo(map)

      marcadoresParadaRef.current.set(p.codigo, { marker, popup, lng: p.lng, lat: p.lat })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [llegadas, paradaSeleccionada, rutaMostrada])

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
  }, [paradaSeleccionada])

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
  }, [activos])

  return (
    <div className="screen no-pad">
      {rutasActivas.length > 1 && (
        <div className="route-tabs">
          {rutasActivas.map((r) => (
            <button
              key={r.id}
              className={rutaMostrada?.id === r.id ? 'active' : ''}
              style={{ '--tab-color': r.color }}
              onClick={() => elegirRuta(r.id)}
            >
              {r.nombre.replace('Ruta ', 'R')}
            </button>
          ))}
        </div>
      )}

      <div className="map-wrap">
        <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />

        {!rutaMostrada && (
          <div className="map-legend">
            <p className="empty-state">
              No hay trolleys en servicio ahora mismo. Vuelve a revisar en
              unos minutos.
            </p>
          </div>
        )}
      </div>

      {llegadas && (
        <div className="stops-panel">
          <div className="stops-panel-header" style={{ color: rutaMostrada.color }}>
            {rutaMostrada.nombre} — {choferDeRutaMostrada.nombre}
          </div>
          {geometria?.esAproximada && (
            <p className="hint" style={{ padding: '0 4px', marginTop: 0 }}>
              Cargando trazado real por carreteras…
            </p>
          )}
          <div className="stops-list">
            {llegadas.paradas.map((p) => (
              <div
                key={p.codigo}
                className={
                  'stop-row' +
                  (p.codigo === llegadas.proximaCodigo ? ' next' : '') +
                  (p.codigo === paradaSeleccionada ? ' selected' : '')
                }
                onClick={() => elegirParada(p.codigo)}
                role="button"
                tabIndex={0}
              >
                <span className="stop-dot" style={{ background: rutaMostrada.color }} />
                <span className="stop-name">{p.nombre}</span>
                <span className="stop-eta">
                  {p.minutos <= 0 ? 'Aquí' : `${p.minutos} min`}
                  {p.vuelta ? ' *' : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '0 4px' }}>
            Tiempos estimados según la posición GPS actual del chofer y la
            distancia real por carretera a cada parada (no es un horario
            fijo). * = próxima vuelta. Toca una parada para verla en el mapa.
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
