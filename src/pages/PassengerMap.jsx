import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
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
// reales de Vega Alta / tu municipio)
const CENTRO_MAPA = [18.413, -66.3944]

const trolleyIcon = L.divIcon({
  className: '',
  html: `<div class="trolley-marker"><span>🚋</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
})

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

// Vive DENTRO de <MapContainer> para poder controlar el mapa:
// - Cuando cambia la geometría de la ruta mostrada, encuadra el mapa a
//   toda la ruta (zoom automático).
// - Cuando el pasajero toca una parada en la lista, centra el mapa ahí
//   y abre su popup.
function ControladorDeMapa({ geometria, paradaSeleccionada, paradas, marcadoresRef }) {
  const map = useMap()

  useEffect(() => {
    if (!geometria?.geometry?.length) return
    const bounds = L.latLngBounds(geometria.geometry)
    map.fitBounds(bounds, { padding: [32, 32] })
  }, [geometria, map])

  useEffect(() => {
    if (!paradaSeleccionada || !paradas) return
    const p = paradas.find((x) => x.codigo === paradaSeleccionada)
    if (!p) return
    map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    const marker = marcadoresRef.current.get(p.codigo)
    if (marker) marker.openPopup()
  }, [paradaSeleccionada, paradas, map, marcadoresRef])

  return null
}

export default function PassengerMap() {
  const [choferes, setChoferes] = useState({})
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null)
  const [paradaSeleccionada, setParadaSeleccionada] = useState(null)
  const marcadoresRef = useRef(new Map())

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
        <MapContainer
          center={CENTRO_MAPA}
          zoom={13}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ControladorDeMapa
            geometria={geometria}
            paradaSeleccionada={paradaSeleccionada}
            paradas={llegadas?.paradas}
            marcadoresRef={marcadoresRef}
          />

          {geometria && (
            <Polyline
              positions={geometria.geometry}
              pathOptions={{ color: rutaMostrada.color, weight: 4, opacity: 0.75 }}
            />
          )}

          {llegadas &&
            llegadas.paradas.map((p) => {
              const esSeleccionada = p.codigo === paradaSeleccionada
              const esProxima = p.codigo === llegadas.proximaCodigo
              return (
                <CircleMarker
                  key={p.codigo}
                  ref={(el) => {
                    if (el) marcadoresRef.current.set(p.codigo, el)
                    else marcadoresRef.current.delete(p.codigo)
                  }}
                  center={[p.lat, p.lng]}
                  radius={esSeleccionada ? 10 : esProxima ? 7 : 4}
                  pathOptions={{
                    color: esSeleccionada ? '#17262a' : rutaMostrada.color,
                    fillColor: esProxima || esSeleccionada ? rutaMostrada.color : '#fff',
                    fillOpacity: 1,
                    weight: esSeleccionada ? 3 : 2,
                  }}
                  eventHandlers={{ click: () => elegirParada(p.codigo) }}
                >
                  <Popup>
                    <div className="popup-card">
                      <b>{p.nombre}</b>
                      <br />
                      {p.vuelta
                        ? `~${p.minutos} min (próxima vuelta)`
                        : `~${p.minutos} min`}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })}

          {activos.map((c) => (
            <Marker key={c.uid} position={[c.lat, c.lng]} icon={trolleyIcon}>
              <Popup>
                <div className="popup-card">
                  <b>{obtenerRuta(c.ruta)?.nombre || 'Trolley'}</b>
                  <br />
                  Chofer: {c.nombre}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

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
