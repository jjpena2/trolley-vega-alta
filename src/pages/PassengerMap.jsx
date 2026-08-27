import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { onValue, ref } from 'firebase/database'
import { db } from '../firebase'

// Centro aproximado del pueblo de Vega Alta, Puerto Rico
const CENTRO_VEGA_ALTA = [18.4130, -66.3944]

const trolleyIcon = L.divIcon({
  className: '',
  html: `<div class="trolley-marker"><span>🚋</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 30],
  popupAnchor: [0, -28],
})

export default function PassengerMap() {
  const [choferes, setChoferes] = useState({})

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

  return (
    <div className="screen no-pad">
      <div className="map-wrap">
        <MapContainer
          center={CENTRO_VEGA_ALTA}
          zoom={15}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {activos.map((c) => (
            <Marker key={c.uid} position={[c.lat, c.lng]} icon={trolleyIcon}>
              <Popup>
                <div className="popup-card">
                  <b>{c.ruta || 'Trolley'}</b>
                  <br />
                  Chofer: {c.nombre}
                  {c.actualizado && (
                    <>
                      <br />
                      <small>
                        Actualizado{' '}
                        {Math.max(
                          0,
                          Math.round((Date.now() - c.actualizado) / 1000)
                        )}
                        s atrás
                      </small>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div className="map-legend">
          {activos.length === 0 ? (
            <p className="empty-state">
              No hay trolleys en servicio ahora mismo. Vuelve a revisar en
              unos minutos.
            </p>
          ) : (
            activos.map((c) => (
              <div className="row" key={c.uid}>
                <span className="dot" />
                <span>
                  <b>{c.ruta || 'Trolley'}</b> — {c.nombre}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
