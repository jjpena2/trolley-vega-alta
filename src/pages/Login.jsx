import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await login(correo.trim(), contrasena)
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
          Entrar
        </h2>
        <p className="hint" style={{ marginBottom: 18 }}>
          Accede a tu cuenta de pasajero o chofer.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={onSubmit}>
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
              placeholder="••••••••"
            />
          </div>

          <button className="btn-primary" type="submit" disabled={cargando}>
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          ¿No tienes cuenta?{' '}
          <Link className="link-btn" to="/registro">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}

function mensajeError(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.'
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
    default:
      return 'No se pudo iniciar sesión. Intenta de nuevo.'
  }
}
