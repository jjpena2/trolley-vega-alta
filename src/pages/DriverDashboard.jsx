import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, onDisconnect, update } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useRoutes } from '../context/RoutesContext'
import { calcularLlegadasPorDistancia } from '../data/routesVegaBaja'

export default function DriverDashboard() {
  const { user, profile } = useAuth()
  const { motor } = useRoutes()
  const [enServicio, setEnServicio] = useState(false)
  const [ultimaPosicion, setUltimaPosicion] = useState(null)
  const [precision, setPrecision] = useState(null)
  const [error, setError] = useState('')
  const watchIdRef = useRef(null)

  const choferRef = ref(db, `choferesActivos/${user.uid}`)
  const ruta = motor.obtenerRuta(profile?.ruta)
  const [geometria, setGeometria] = useState(null)

  useEffect(() => {
    if (!ruta) return
    setGeometria(motor.geometriaAproximadaConConexiones(ruta))
    let cancelado = false
    motor
      .geometriaRealConConexiones(ruta)
      .then((real) => {
        if (!cancelado) setGeometria(real)
      })
      .catch(() => {})
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta])

  const llegadas = useMemo(() => {
    if (!geometria || !ultimaPosicion) return null
    return calcularLlegadasPorDistancia(geometria, ultimaPosicion)
  }, [geometria, ultimaPosicion])

  // Si el chofer cierra la app sin apagar el servicio, Firebase lo marca
  // como inactivo automáticamente al perder la conexión.
  useEffect(() => {
    onDisconnect(choferRef).update({ activo: false })
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function iniciarServicio() {
    if (profile?.habilitado === false) {
      setError('Tu cuenta de chofer está deshabilitada. Contacta al administrador.')
      return
    }
    if (!('geolocation' in navigator)) {
      setError('Este dispositivo no soporta geolocalización.')
      return
    }
    setError('')

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords
        setUltimaPosicion({ lat: latitude, lng: longitude })
        setPrecision(accuracy)
        update(choferRef, {
          nombre: profile?.nombre || 'Chofer',
          ruta: profile?.ruta || '',
          telefono: profile?.telefono || '',
          activo: true,
          lat: latitude,
          lng: longitude,
          rumbo: heading ?? null,
          velocidad: speed ?? null,
          actualizado: Date.now(),
        })
      },
      (err) => {
        setError(traducirErrorGeo(err.code))
        detenerServicio()
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )

    watchIdRef.current = id
    setEnServicio(true)
  }

  function detenerServicio() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setEnServicio(false)
    update(choferRef, { activo: false })
  }

  return (
    <div className="screen">
      <div className="card">
        <span className={`status-pill ${enServicio ? 'on' : 'off'}`}>
          <span className="blip" />
          {enServicio ? 'Compartiendo ubicación' : 'Fuera de servicio'}
        </span>

        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Hola, {profile?.nombre?.split(' ')[0] || 'chofer'}
        </h2>
        <p className="hint" style={{ marginBottom: 20 }}>
          Ruta: <b>{ruta?.nombre || 'Sin asignar'}</b>
        </p>

        {error && <div className="error-banner">{error}</div>}

        {profile?.habilitado === false && (
          <div className="error-banner">
            Tu cuenta de chofer está deshabilitada por el administrador. No
            puedes activar el servicio hasta que te habiliten de nuevo.
          </div>
        )}

        <button
          className={`big-toggle ${enServicio ? 'stop' : 'start'}`}
          onClick={enServicio ? detenerServicio : iniciarServicio}
          disabled={!enServicio && profile?.habilitado === false}
        >
          {enServicio ? 'Terminar servicio' : 'Comenzar servicio'}
        </button>

        <div className="stat-row">
          <div className="stat">
            <div className="value">
              {ultimaPosicion
                ? `${ultimaPosicion.lat.toFixed(4)}, ${ultimaPosicion.lng.toFixed(4)}`
                : '—'}
            </div>
            <div className="label">Coordenadas</div>
          </div>
          <div className="stat">
            <div className="value">
              {precision ? `±${Math.round(precision)} m` : '—'}
            </div>
            <div className="label">Precisión GPS</div>
          </div>
        </div>

        <p className="hint" style={{ marginBottom: 0 }}>
          Mantén la pantalla encendida y la app abierta mientras conduces
          para que los pasajeros vean tu ubicación en tiempo real.
        </p>
      </div>

      {llegadas && (
        <div className="card" style={{ paddingBottom: 8 }}>
          <p
            className="hint"
            style={{ marginTop: 0, textTransform: 'uppercase', fontWeight: 700 }}
          >
            Tus próximas paradas
          </p>
          <div className="stops-list">
            {llegadas.paradas.map((p) => (
              <div
                key={p.codigo}
                className={
                  'stop-row' + (p.codigo === llegadas.proximaCodigo ? ' next' : '')
                }
              >
                <span className="stop-dot" style={{ background: ruta.color }} />
                <span className="stop-name">{p.nombre}</span>
                <span className="stop-eta">
                  {p.minutos <= 0 ? 'Aquí' : `${p.minutos} min`}
                  {p.vuelta ? ' *' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function traducirErrorGeo(code) {
  switch (code) {
    case 1:
      return 'Debes permitir el acceso a tu ubicación para comenzar el servicio.'
    case 2:
      return 'No se pudo determinar tu ubicación. Revisa tu señal GPS.'
    case 3:
      return 'Se agotó el tiempo esperando tu ubicación. Intenta de nuevo.'
    default:
      return 'Ocurrió un error obteniendo tu ubicación.'
  }
}
