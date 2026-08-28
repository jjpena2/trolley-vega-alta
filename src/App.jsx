import { Link, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Register from './pages/Register'
import PassengerMap from './pages/PassengerMap'
import DriverDashboard from './pages/DriverDashboard'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  const { user, profile, loading, logout } = useAuth()

  if (loading) {
    return (
      <div className="app-shell">
        <div className="screen" style={{ justifyContent: 'center' }}>
          <p className="empty-state">Cargando…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar user={user} onSalir={logout} />

      <Routes>
        <Route
          path="/"
          element={
            profile?.rol === 'chofer' ? (
              <PrivateRoute user={user}>
                <DriverDashboard />
              </PrivateRoute>
            ) : profile?.rol === 'admin' ? (
              <PrivateRoute user={user}>
                <AdminDashboard />
              </PrivateRoute>
            ) : (
              <PassengerMap />
            )
          }
        />
        <Route
          path="/entrar"
          element={user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/registro"
          element={user ? <Navigate to="/" replace /> : <Register />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {user && <BottomNav rol={profile?.rol} />}
    </div>
  )
}

function TopBar({ user, onSalir }) {
  return (
    <div className="topbar">
      <div className="mark" aria-hidden="true">
        <span style={{ fontSize: 18 }}>🚋</span>
      </div>
      <div>
        <h1>Trolley Vega Alta</h1>
        <p className="subtitle">Rastreo en vivo</p>
      </div>
      <div className="spacer" />
      {user ? (
        <button className="icon-btn" onClick={onSalir}>
          Salir
        </button>
      ) : (
        <Link className="icon-btn" to="/entrar">
          Entrar
        </Link>
      )}
    </div>
  )
}

function PrivateRoute({ user, children }) {
  if (!user) return <Navigate to="/entrar" replace />
  return children
}

function BottomNav({ rol }) {
  const icono = rol === 'chofer' ? '🚦' : rol === 'admin' ? '🛠️' : '🗺️'
  const etiqueta = rol === 'chofer' ? 'Mi servicio' : rol === 'admin' ? 'Administrar' : 'Mapa'
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
        <span className="nav-icon">{icono}</span>
        {etiqueta}
      </NavLink>
    </nav>
  )
}
