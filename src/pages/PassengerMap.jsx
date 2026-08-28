import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import { onValue, ref } from 'firebase/database'
import { db } from '../firebase'
import { ROUTES, obtenerRuta, obtenerTrazado, calcularLlegadasPorDistancia } from '../data/routesVegaBaja'

// Centro aproximado del pueblo (ajusta esto cuando tengas las
// coordenadas reales de Vega Alta / tu municipio)
const CENTRO_MAPA = [18.4130, -66.3944]

const trolleyIcon = L.divIcon({
  className: '',
  html: `<div class="trolley-marker"><span>🚋</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
})

export default function PassengerMap() {
  const [choferes, setChoferes] = useState({})
  const [rutaSeleccionada, setRutaSeleccionada] = useState(null)

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

  // Rutas que tienen al menos un trolley activo ahora mismo
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

  const llegadas = useMemo(() => {
    if (!rutaMostrada || !choferDeRutaMostrada) return null
    return calcularLlegadasPorDistancia(rutaMostrada, {
      lat: choferDeRutaMostrada.lat,
      lng: choferDeRutaMostrada.lng,
    })
  }, [rutaMostrada, choferDeRutaMostrada])

  const trazado = rutaMostrada ? obtenerTrazado(rutaMostrada) : null

  return (
    <div className="screen no-pad">
      {rutasActivas.length > 1 && (
        <div className="route-tabs">
          {rutasActivas.map((r) => (
            <button
              key={r.id}
              className={rutaMostrada?.id === r.id ? 'active' : ''}
              style={{ '--tab-color': r.color }}
              onClick={() => setRutaSeleccionada(r.id)}
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

          {trazado && (
            <Polyline
              positions={trazado}
              pathOptions={{ color: rutaMostrada.color, weight: 4, opacity: 0.75 }}
            />
          )}

          {llegadas &&
            llegadas.paradas.map((p) => (
              <CircleMarker
                key={p.codigo}
                center={[p.lat, p.lng]}
                radius={p.codigo === llegadas.proximaCodigo ? 7 : 4}
                pathOptions={{
                  color: rutaMostrada.color,
                  fillColor:
                    p.codigo === llegadas.proximaCodigo ? rutaMostrada.color : '#fff',
                  fillOpacity: 1,
                  weight: 2,
                }}
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
            ))}

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
          <div className="stops-list">
            {llegadas.paradas.map((p) => (
              <div
                key={p.codigo}
                className={
                  'stop-row' + (p.codigo === llegadas.proximaCodigo ? ' next' : '')
                }
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
            distancia a cada parada (no es un horario fijo). * = próxima
            vuelta.
          </p>
        </div>
      )}
    </div>
  )
}
