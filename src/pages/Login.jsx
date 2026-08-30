import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [modoRecuperar, setModoRecuperar] = useState(false)

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

  if (modoRecuperar) {
    return (
      <RecuperarContrasena
        correoInicial={correo}
        onVolver={() => setModoRecuperar(false)}
      />
    )
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
          <button className="link-btn" onClick={() => setModoRecuperar(true)}>
            ¿Olvidaste tu contraseña?
          </button>
        </p>

        <p style={{ textAlign: 'center', marginTop: 8 }}>
          ¿No tienes cuenta?{' '}
          <Link className="link-btn" to="/registro">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  )
}

function RecuperarContrasena({ correoInicial, onVolver }) {
  const [correo, setCorreo] = useState(correoInicial || '')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await sendPasswordResetEmail(auth, correo.trim())
      setEnviado(true)
    } catch (err) {
      // Si el correo simplemente no existe, mostramos igual el mensaje
      // de "enviado" — así este formulario no sirve para averiguar qué
      // correos están registrados en la app.
      if (err.code === 'auth/user-not-found') {
        setEnviado(true)
      } else {
        setError(mensajeErrorRecuperar(err.code))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="screen">
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Recuperar contraseña
        </h2>

        {enviado ? (
          <>
            <p className="hint" style={{ marginBottom: 18 }}>
              Si <b>{correo}</b> tiene una cuenta, te acabamos de enviar un
              correo con un enlace para elegir una contraseña nueva.
              Revisa también la carpeta de spam.
            </p>
            <button className="btn-primary" onClick={onVolver}>
              Volver a entrar
            </button>
          </>
        ) : (
          <>
            <p className="hint" style={{ marginBottom: 18 }}>
              Escribe el correo con el que te registraste. Te vamos a
              mandar un enlace para elegir una contraseña nueva.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <form onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="correo-recuperar">Correo electrónico</label>
                <input
                  id="correo-recuperar"
                  type="email"
                  required
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="tunombre@correo.com"
                />
              </div>

              <button className="btn-primary" type="submit" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar enlace'}
              </button>
            </form>

            <p style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="link-btn" onClick={onVolver}>
                ← Volver a entrar
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function mensajeErrorRecuperar(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'El correo electrónico no es válido.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera un momento e intenta de nuevo.'
    default:
      // Ojo: a propósito no decimos "ese correo no existe" — así nadie
      // puede usar este formulario para averiguar qué correos están
      // registrados en la app.
      return 'No se pudo procesar la solicitud. Intenta de nuevo en un momento.'
  }
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
