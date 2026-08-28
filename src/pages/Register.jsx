import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ROUTES } from '../data/routesVegaBaja'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [rol, setRol] = useState('pasajero')
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState(ROUTES[0].id)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

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
      })
      navigate('/')
    } catch (err) {
      setError(mensajeError(err.code))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Crear cuenta
        </h2>

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

        {rol === 'chofer' && (
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

              <div className="field">
                <label htmlFor="ruta">Ruta asignada</label>
                <select
                  id="ruta"
                  value={rutaId}
                  onChange={(e) => setRutaId(e.target.value)}
                >
                  {ROUTES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button className="btn-primary" type="submit" disabled={cargando}>
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          ¿Ya tienes cuenta?{' '}
          <Link className="link-btn" to="/entrar">
            Entra aquí
          </Link>
        </p>
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
