import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ref, get, update } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePueblo } from '../context/PuebloContext'
import { useRoutesForPueblo } from '../context/RoutesContext'

export default function Register() {
  const { register } = useAuth()
  const { pueblos, puebloActivo } = usePueblo()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const invitacionId = searchParams.get('invitacion')

  const [invitacion, setInvitacion] = useState(undefined) // undefined = cargando, null = no hay/inválida
  const [errorInvitacion, setErrorInvitacion] = useState('')

  useEffect(() => {
    if (!invitacionId) {
      setInvitacion(null)
      return
    }
    get(ref(db, `invitaciones/${invitacionId}`)).then((snap) => {
      if (!snap.exists()) {
        setErrorInvitacion('Este enlace de invitación no existe o ya no es válido.')
        setInvitacion(null)
        return
      }
      const val = snap.val()
      if (val.usado) {
        setErrorInvitacion('Esta invitación ya fue usada. Pide una nueva.')
        setInvitacion(null)
        return
      }
      if (val.expira && Date.now() > val.expira) {
        setErrorInvitacion('Esta invitación ya venció. Pide una nueva.')
        setInvitacion(null)
        return
      }
      setInvitacion({ id: invitacionId, ...val })
    })
  }, [invitacionId])

  const [rol, setRol] = useState('pasajero')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [telefono, setTelefono] = useState('')
  const [puebloId, setPuebloId] = useState(puebloActivo?.id || '')
  const [rutaId, setRutaId] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  // Si vienen de una invitación, el rol y el pueblo quedan fijos —
  // no los puede cambiar la persona que se está registrando.
  useEffect(() => {
    if (invitacion) {
      setRol(invitacion.rol || 'chofer')
      setPuebloId(invitacion.puebloId || '')
      if (invitacion.rutaId) setRutaId(invitacion.rutaId)
    }
  }, [invitacion])

  const pueblosParaElegir = pueblos.length ? pueblos : [puebloActivo].filter(Boolean)
  const { rutas } = useRoutesForPueblo(puebloId)

  useEffect(() => {
    if (!rutaId && rutas.length) setRutaId(rutas[0].id)
  }, [rutas, rutaId])

  // Si cambia el pueblo elegido (solo posible sin invitación), la ruta
  // anterior ya no aplica.
  useEffect(() => {
    if (!invitacion) setRutaId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puebloId])

  async function onSubmit(e) {
    e.preventDefault()
    setError('')

    if (rol === 'chofer' && telefono.trim().length < 7) {
      setError('Ingresa un número de teléfono válido para contacto.')
      return
    }

    setCargando(true)
    try {
      await register({
        nombre: nombre.trim(),
        correo: correo.trim(),
        contrasena,
        rol,
        telefono: telefono.trim(),
        ruta: rol === 'chofer' ? rutaId : '',
        puebloId: rol === 'chofer' ? puebloId : '',
        pueblosAdmin:
          rol === 'admin' && invitacion?.puebloId ? { [invitacion.puebloId]: true } : undefined,
      })
      if (invitacion) {
        await update(ref(db, `invitaciones/${invitacion.id}`), { usado: true })
      }
      navigate('/')
    } catch (err) {
      setError(mensajeError(err.code))
    } finally {
      setCargando(false)
    }
  }

  if (invitacionId && invitacion === undefined) {
    return (
      <div className="screen">
        <p className="empty-state">Revisando tu invitación…</p>
      </div>
    )
  }

  if (invitacionId && !invitacion) {
    return (
      <div className="screen">
        <div className="card">
          <div className="error-banner">{errorInvitacion}</div>
          <Link className="btn-primary" to="/registro" style={{ display: 'block', textAlign: 'center' }}>
            Registrarme sin invitación
          </Link>
        </div>
      </div>
    )
  }

  const puebloDeInvitacion = pueblosParaElegir.find((p) => p.id === invitacion?.puebloId)
  const rutaDeInvitacion = rutas.find((r) => r.id === invitacion?.rutaId)

  return (
    <div className="screen">
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          {invitacion ? 'Completa tu registro' : 'Crear cuenta'}
        </h2>

        {invitacion ? (
          <p className="hint">
            Te invitaron a unirte como{' '}
            <b>{invitacion.rol === 'admin' ? 'administrador' : 'chofer'}</b>
            {puebloDeInvitacion && (
              <>
                {' '}
                de <b>{puebloDeInvitacion.nombre}</b>
              </>
            )}
            {rutaDeInvitacion && (
              <>
                {' '}
                en la <b>{rutaDeInvitacion.nombre}</b>
              </>
            )}
            . Solo completa tus datos para activar tu cuenta.
          </p>
        ) : (
          <div className="role-toggle">
            <button
              type="button"
              className={rol === 'pasajero' ? 'active' : ''}
              onClick={() => setRol('pasajero')}
            >
              Soy pasajero
            </button>
            <button
              type="button"
              className={rol === 'chofer' ? 'active' : ''}
              onClick={() => setRol('chofer')}
            >
              Soy chofer
            </button>
          </div>
        )}

        {!invitacion && rol === 'chofer' && (
          <p className="hint">
            Como chofer podrás activar tu ubicación en vivo para que los
            pasajeros vean por dónde va tu trolley.
          </p>
        )}

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellido"
            />
          </div>

          <div className="field">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="tunombre@correo.com"
            />
          </div>

          <div className="field">
            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              required
              minLength={6}
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {rol === 'chofer' && (
            <>
              <div className="field">
                <label htmlFor="telefono">Teléfono de contacto</label>
                <input
                  id="telefono"
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="787-000-0000"
                />
              </div>

              {!invitacion && (
                <div className="field">
                  <label htmlFor="pueblo">Pueblo / municipio</label>
                  <select
                    id="pueblo"
                    value={puebloId}
                    onChange={(e) => setPuebloId(e.target.value)}
                  >
                    {pueblosParaElegir.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!(invitacion && invitacion.rutaId) && (
                <div className="field">
                  <label htmlFor="ruta">Ruta asignada</label>
                  <select
                    id="ruta"
                    value={rutaId}
                    onChange={(e) => setRutaId(e.target.value)}
                  >
                    {rutas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <button className="btn-primary" type="submit" disabled={cargando}>
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        {!invitacion && (
          <p style={{ textAlign: 'center', marginTop: 16 }}>
            ¿Ya tienes cuenta?{' '}
            <Link className="link-btn" to="/entrar">
              Entra aquí
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

function mensajeError(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo.'
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.'
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.'
    default:
      return 'No se pudo crear la cuenta. Intenta de nuevo.'
  }
}
