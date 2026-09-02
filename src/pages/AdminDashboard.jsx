import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, set, push } from 'firebase/database'
import { sendPasswordResetEmail } from 'firebase/auth'
import { db, auth, crearCuentaSinPerderSesion } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePueblo } from '../context/PuebloContext'
import { useRoutesForPueblo, useRutasHuerfanas } from '../context/RoutesContext'
import { useBannersForPueblo, useHistorialAnuncios, calcularDiasActivosPorAnuncio } from '../context/BannersContext'
import { RUTAS_SEMILLA, claveParada } from '../data/routesVegaBaja'

// Firebase no deja que un admin le ponga directamente una contraseña
// nueva a otra cuenta (eso requeriría un servidor propio con
// privilegios especiales, que esta app no tiene). Lo que sí podemos
// hacer, de forma segura, es enviarle a esa persona un correo para que
// ELLA elija su nueva contraseña.
async function enviarRestablecerContrasena(correo) {
  await sendPasswordResetEmail(auth, correo)
}

// Para "invitar" a alguien (chofer o admin) sin que tú tengas que
// inventarle una contraseña: se crea la cuenta con una contraseña
// temporal al azar que nadie ve ni usa nunca, y de inmediato se le
// manda el correo de "restablecer contraseña" de Firebase — así la
// persona solo tiene que elegir SU propia contraseña para activar la
// cuenta.
function contrasenaTemporalAlAzar() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default function AdminDashboard() {
  const { profile } = useAuth()
  const { pueblos } = usePueblo()
  const esSuperadmin = profile?.rol === 'superadmin'

  // A qué pueblos tiene acceso esta persona para administrar.
  const pueblosAdministrables = useMemo(() => {
    if (esSuperadmin) return pueblos
    return pueblos.filter((p) => profile?.pueblosAdmin?.[p.id])
  }, [esSuperadmin, pueblos, profile?.pueblosAdmin])

  const [puebloAdminId, setPuebloAdminId] = useState('')
  useEffect(() => {
    if (!puebloAdminId && pueblosAdministrables.length) {
      setPuebloAdminId(pueblosAdministrables[0].id)
    }
  }, [pueblosAdministrables, puebloAdminId])

  const [tab, setTab] = useState('choferes')

  if (!esSuperadmin && !pueblosAdministrables.length) {
    return (
      <div className="screen">
        <div className="error-banner">
          Tu cuenta es de administrador, pero todavía no tienes ningún
          pueblo asignado. Pide al superadministrador que te agregue a
          uno desde la pestaña "Usuarios".
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      {pueblosAdministrables.length > 1 && (
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Administrando</label>
          <select value={puebloAdminId} onChange={(e) => setPuebloAdminId(e.target.value)}>
            {pueblosAdministrables.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="admin-tabs">
        <button type="button" className={tab === 'choferes' ? 'active' : ''} onClick={() => setTab('choferes')}>
          Choferes
        </button>
        <button type="button" className={tab === 'rutas' ? 'active' : ''} onClick={() => setTab('rutas')}>
          Rutas
        </button>
        <button type="button" className={tab === 'publicidad' ? 'active' : ''} onClick={() => setTab('publicidad')}>
          Publicidad
        </button>
        <button
          type="button"
          className={tab === 'administradores' ? 'active' : ''}
          onClick={() => setTab('administradores')}
        >
          Administradores
        </button>
        {esSuperadmin && (
          <>
            <button type="button" className={tab === 'pueblos' ? 'active' : ''} onClick={() => setTab('pueblos')}>
              Pueblos
            </button>
            <button type="button" className={tab === 'usuarios' ? 'active' : ''} onClick={() => setTab('usuarios')}>
              Usuarios
            </button>
            <button type="button" className={tab === 'facturacion' ? 'active' : ''} onClick={() => setTab('facturacion')}>
              Facturación
            </button>
          </>
        )}
      </div>

      {tab === 'choferes' && <PanelChoferes puebloId={puebloAdminId} esSuperadmin={esSuperadmin} />}
      {tab === 'rutas' && <PanelRutas puebloId={puebloAdminId} />}
      {tab === 'publicidad' && <PanelPublicidad puebloId={puebloAdminId} />}
      {tab === 'administradores' && (
        <PanelAdministradoresDePueblo
          puebloId={puebloAdminId}
          puebloNombre={pueblosAdministrables.find((p) => p.id === puebloAdminId)?.nombre}
          esSuperadmin={esSuperadmin}
        />
      )}
      {tab === 'pueblos' && esSuperadmin && (
        <PanelPueblos
          onAdministrar={(id, destino) => {
            setPuebloAdminId(id)
            setTab(destino)
          }}
        />
      )}
      {tab === 'usuarios' && esSuperadmin && <PanelUsuarios />}
      {tab === 'facturacion' && esSuperadmin && <PanelFacturacion />}
    </div>
  )
}

// ==================== CHOFERES ====================

function PanelChoferes({ puebloId, esSuperadmin }) {
  const { rutas } = useRoutesForPueblo(puebloId)
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const usuariosRef = ref(db, 'usuarios')
    const unsub = onValue(
      usuariosRef,
      (snap) => setUsuarios(snap.exists() ? snap.val() : {}),
      () =>
        setError(
          'No se pudo leer la lista de choferes. Revisa que las reglas de la base de datos permitan a los admins leer /usuarios.'
        )
    )
    return unsub
  }, [])

  const choferes = useMemo(() => {
    if (!usuarios) return []
    return Object.entries(usuarios)
      .map(([uid, u]) => ({ uid, ...u }))
      .filter((u) => u.rol === 'chofer' && u.puebloId === puebloId)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  }, [usuarios, puebloId])

  // Cualquier cuenta que todavía no sea chofer de ESTE pueblo (puede
  // ser un pasajero, un chofer de otro pueblo, etc.) — para asignarla
  // sin crear una cuenta nueva. Un admin regular (no superadmin) solo
  // ve cuentas que no pertenecen a OTRO pueblo — así nunca ve ni toca
  // datos de choferes/admins ajenos a lo que administra.
  const usuariosDisponibles = useMemo(() => {
    if (!usuarios) return []
    return Object.entries(usuarios)
      .map(([uid, u]) => ({ uid, ...u }))
      .filter((u) => {
        if (u.rol === 'chofer' && u.puebloId === puebloId) return false // ya lo es
        if (esSuperadmin) return true
        const perteneceAOtroPueblo =
          (u.rol === 'chofer' && u.puebloId && u.puebloId !== puebloId) ||
          (u.rol === 'admin' &&
            u.pueblosAdmin &&
            Object.keys(u.pueblosAdmin).some((id) => id !== puebloId)) ||
          u.rol === 'superadmin'
        return !perteneceAOtroPueblo
      })
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  }, [usuarios, puebloId, esSuperadmin])

  async function guardarCambios(uid, cambios) {
    await update(ref(db, `usuarios/${uid}`), cambios)
  }

  async function crearChofer({ nombre, correo, telefono, rutaId }) {
    const uid = await crearCuentaSinPerderSesion(correo, contrasenaTemporalAlAzar())
    await set(ref(db, `usuarios/${uid}`), {
      nombre,
      correo,
      rol: 'chofer',
      telefono,
      ruta: rutaId,
      puebloId,
      habilitado: true,
      creado: Date.now(),
    })
    await enviarRestablecerContrasena(correo)
  }

  async function asignarChoferExistente({ uid, telefono, rutaId }) {
    await update(ref(db, `usuarios/${uid}`), {
      rol: 'chofer',
      puebloId,
      ruta: rutaId,
      telefono,
      habilitado: true,
    })
  }

  if (error) return <div className="error-banner">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <FormularioNuevoChofer rutas={rutas} onCrear={crearChofer} />
        <FormularioAsignarExistente
          usuariosDisponibles={usuariosDisponibles}
          rutas={rutas}
          onAsignar={asignarChoferExistente}
        />
      </div>

      {usuarios === null && <p className="empty-state">Cargando choferes…</p>}
      {usuarios !== null && !choferes.length && (
        <p className="empty-state">Todavía no hay choferes registrados en este pueblo.</p>
      )}
      {choferes.map((c) => (
        <FilaChofer key={c.uid} chofer={c} rutas={rutas} onGuardar={guardarCambios} />
      ))}
    </div>
  )
}

function FormularioNuevoChofer({ rutas, onCrear }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [creando, setCreando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setError('')
    if (!nombre.trim() || !correo.trim() || !telefono.trim()) {
      setError('Completa nombre, correo y teléfono.')
      return
    }
    setCreando(true)
    try {
      await onCrear({
        nombre: nombre.trim(),
        correo: correo.trim(),
        telefono: telefono.trim(),
        rutaId,
      })
      setEnviado(true)
    } catch (e) {
      setError(mensajeErrorCuenta(e.code))
    } finally {
      setCreando(false)
    }
  }

  function cerrar() {
    setNombre('')
    setCorreo('')
    setTelefono('')
    setRutaId('')
    setEnviado(false)
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <button className="btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        + Invitar chofer
      </button>
    )
  }

  if (enviado) {
    return (
      <div className="card" style={{ flex: '1 1 100%' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>¡Listo! ✓</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Le mandamos un correo a <b>{correo}</b> para que elija su
          contraseña y active su cuenta de chofer. Si no lo ve en un
          par de minutos, pídele que revise la carpeta de spam.
        </p>
        <button className="btn-primary" onClick={cerrar}>
          Listo
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Invitar chofer</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Le vamos a mandar un correo para que elija su propia contraseña
        — no necesitas inventarle una.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="field">
        <label>Correo electrónico</label>
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </div>
      <div className="field">
        <label>Teléfono</label>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>
      <div className="field">
        <label>Ruta asignada</label>
        <select value={rutaId} onChange={(e) => setRutaId(e.target.value)}>
          <option value="">Sin asignar</option>
          {rutas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={creando}>
          {creando ? 'Enviando…' : 'Invitar'}
        </button>
      </div>
    </div>
  )
}

function mensajeErrorCuenta(code) {
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

function FormularioAsignarExistente({ usuariosDisponibles, rutas, onAsignar }) {
  const [abierto, setAbierto] = useState(false)
  const [uidElegido, setUidElegido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState('')

  const elegido = usuariosDisponibles.find((u) => u.uid === uidElegido)

  function elegirUsuario(uid) {
    setUidElegido(uid)
    const u = usuariosDisponibles.find((x) => x.uid === uid)
    setTelefono(u?.telefono || '')
  }

  async function confirmar() {
    setError('')
    if (!uidElegido) {
      setError('Elige una cuenta de la lista.')
      return
    }
    if (!telefono.trim()) {
      setError('Ingresa un teléfono de contacto.')
      return
    }
    setAsignando(true)
    try {
      await onAsignar({ uid: uidElegido, telefono: telefono.trim(), rutaId })
      setUidElegido('')
      setTelefono('')
      setRutaId('')
      setAbierto(false)
    } catch {
      setError('No se pudo asignar. Intenta de nuevo.')
    } finally {
      setAsignando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        Asignar chofer existente
      </button>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Asignar cuenta existente</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Convierte una cuenta que ya existe (por ejemplo, alguien
        registrado como pasajero) en chofer de este pueblo.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label>Cuenta</label>
        <select value={uidElegido} onChange={(e) => elegirUsuario(e.target.value)}>
          <option value="">Selecciona una cuenta…</option>
          {usuariosDisponibles.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.nombre || '(sin nombre)'} — {u.correo} ({u.rol || 'pasajero'})
            </option>
          ))}
        </select>
      </div>

      {elegido && (
        <>
          <div className="field">
            <label>Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </div>
          <div className="field">
            <label>Ruta asignada</label>
            <select value={rutaId} onChange={(e) => setRutaId(e.target.value)}>
              <option value="">Sin asignar</option>
              {rutas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={asignando}>
          {asignando ? 'Asignando…' : 'Asignar como chofer'}
        </button>
      </div>
    </div>
  )
}

function FilaChofer({ chofer, rutas, onGuardar }) {
  const [nombre, setNombre] = useState(chofer.nombre || '')
  const [telefono, setTelefono] = useState(chofer.telefono || '')
  const [rutaId, setRutaId] = useState(chofer.ruta || '')
  const [habilitado, setHabilitado] = useState(chofer.habilitado !== false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [enviandoReset, setEnviandoReset] = useState(false)
  const [resetEnviado, setResetEnviado] = useState(false)
  const [errorReset, setErrorReset] = useState('')

  const hayCambios =
    nombre !== (chofer.nombre || '') ||
    telefono !== (chofer.telefono || '') ||
    rutaId !== (chofer.ruta || '') ||
    habilitado !== (chofer.habilitado !== false)

  async function guardar() {
    setGuardando(true)
    setGuardado(false)
    try {
      await onGuardar(chofer.uid, { nombre, telefono, ruta: rutaId, habilitado })
      setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  async function restablecerContrasena() {
    setErrorReset('')
    setResetEnviado(false)
    setEnviandoReset(true)
    try {
      await enviarRestablecerContrasena(chofer.correo)
      setResetEnviado(true)
    } catch {
      setErrorReset('No se pudo enviar el correo. Revisa que el correo esté bien escrito.')
    } finally {
      setEnviandoReset(false)
    }
  }

  return (
    <div className="card">
      <div className="field">
        <label>Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="field">
        <label>Teléfono</label>
        <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>
      <div className="field">
        <label>Ruta asignada</label>
        <select value={rutaId} onChange={(e) => setRutaId(e.target.value)}>
          <option value="">Sin asignar</option>
          {rutas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="role-toggle" style={{ marginBottom: 16 }}>
        <button type="button" className={habilitado ? 'active' : ''} onClick={() => setHabilitado(true)}>
          Habilitado
        </button>
        <button type="button" className={!habilitado ? 'active' : ''} onClick={() => setHabilitado(false)}>
          Deshabilitado
        </button>
      </div>

      {errorReset && <div className="error-banner">{errorReset}</div>}

      <button className="btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
      </button>

      <button
        className="link-btn"
        style={{ display: 'block', marginTop: 12 }}
        onClick={restablecerContrasena}
        disabled={enviandoReset}
      >
        {enviandoReset
          ? 'Enviando…'
          : resetEnviado
          ? 'Correo enviado ✓'
          : '🔑 Enviarle correo para cambiar contraseña'}
      </button>
    </div>
  )
}

// ==================== ADMINISTRADORES POR PUEBLO ====================
// Disponible para cualquiera que esté administrando el pueblo (no solo
// superadmin), para que cada pueblo pueda designar sus propios
// co-administradores sin depender de pedírselo al superadministrador.

function PanelAdministradoresDePueblo({ puebloId, puebloNombre, esSuperadmin }) {
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const usuariosRef = ref(db, 'usuarios')
    const unsub = onValue(
      usuariosRef,
      (snap) => setUsuarios(snap.exists() ? snap.val() : {}),
      () => setError('No se pudo leer la lista de administradores.')
    )
    return unsub
  }, [])

  // Un admin regular solo ve a otros admins de ESTE pueblo — nunca a
  // los superadmins (que administran todos los pueblos).
  const administradores = useMemo(() => {
    if (!usuarios) return []
    return Object.entries(usuarios)
      .map(([uid, u]) => ({ uid, ...u }))
      .filter((u) => {
        if (u.rol === 'admin' && u.pueblosAdmin?.[puebloId]) return true
        if (u.rol === 'superadmin' && esSuperadmin) return true
        return false
      })
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  }, [usuarios, puebloId, esSuperadmin])

  // Cualquier cuenta que todavía no sea admin de este pueblo, para
  // asignarla sin crear una cuenta nueva. Un admin regular no ve
  // cuentas afiliadas a OTRO pueblo (mismo criterio que en Choferes).
  const usuariosDisponibles = useMemo(() => {
    if (!usuarios) return []
    return Object.entries(usuarios)
      .map(([uid, u]) => ({ uid, ...u }))
      .filter((u) => {
        if (u.rol === 'admin' && u.pueblosAdmin?.[puebloId]) return false // ya lo es
        if (u.rol === 'superadmin') return false // ya administra todo
        if (esSuperadmin) return true
        const perteneceAOtroPueblo =
          (u.rol === 'chofer' && u.puebloId && u.puebloId !== puebloId) ||
          (u.rol === 'admin' &&
            u.pueblosAdmin &&
            Object.keys(u.pueblosAdmin).some((id) => id !== puebloId))
        return !perteneceAOtroPueblo
      })
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  }, [usuarios, puebloId, esSuperadmin])

  async function crearAdmin({ nombre, correo }) {
    const uid = await crearCuentaSinPerderSesion(correo, contrasenaTemporalAlAzar())
    await set(ref(db, `usuarios/${uid}`), {
      nombre,
      correo,
      rol: 'admin',
      pueblosAdmin: { [puebloId]: true },
      habilitado: true,
      creado: Date.now(),
    })
    await enviarRestablecerContrasena(correo)
  }

  async function asignarAdminExistente(uid, pueblosAdminActuales) {
    const nuevo = { ...(pueblosAdminActuales || {}), [puebloId]: true }
    await update(ref(db, `usuarios/${uid}`), { rol: 'admin', pueblosAdmin: nuevo })
  }

  async function quitarDeEstePueblo(uid, pueblosAdminActuales) {
    const nuevo = { ...pueblosAdminActuales }
    delete nuevo[puebloId]
    await update(ref(db, `usuarios/${uid}`), { pueblosAdmin: nuevo })
  }

  if (error) return <div className="error-banner">{error}</div>

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <FormularioNuevoAdmin onCrear={crearAdmin} />
        <FormularioAsignarAdminExistente
          usuariosDisponibles={usuariosDisponibles}
          onAsignar={asignarAdminExistente}
        />
      </div>

      {usuarios === null && <p className="empty-state">Cargando administradores…</p>}

      {usuarios !== null && !administradores.length && (
        <p className="empty-state">Todavía no hay administradores en {puebloNombre || 'este pueblo'}.</p>
      )}

      {administradores.map((a) => (
        <FilaAdmin key={a.uid} admin={a} onQuitar={quitarDeEstePueblo} />
      ))}
    </div>
  )
}

function FilaAdmin({ admin, onQuitar }) {
  const [enviandoReset, setEnviandoReset] = useState(false)
  const [resetEnviado, setResetEnviado] = useState(false)
  const [errorReset, setErrorReset] = useState('')

  async function restablecerContrasena() {
    setErrorReset('')
    setResetEnviado(false)
    setEnviandoReset(true)
    try {
      await enviarRestablecerContrasena(admin.correo)
      setResetEnviado(true)
    } catch {
      setErrorReset('No se pudo enviar el correo.')
    } finally {
      setEnviandoReset(false)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <b>{admin.nombre || '(sin nombre)'}</b>
          <div className="hint" style={{ margin: 0 }}>{admin.correo}</div>
          {admin.rol === 'superadmin' && (
            <div className="hint" style={{ margin: 0, fontWeight: 700 }}>Super admin (todos los pueblos)</div>
          )}
        </div>
        {admin.rol === 'admin' && (
          <button
            className="link-btn"
            style={{ color: '#a83226' }}
            onClick={() => {
              if (confirm(`¿Quitarle acceso de administrador a ${admin.nombre} en este pueblo?`)) {
                onQuitar(admin.uid, admin.pueblosAdmin)
              }
            }}
          >
            Quitar
          </button>
        )}
      </div>

      {errorReset && <div className="error-banner" style={{ marginTop: 12, marginBottom: 0 }}>{errorReset}</div>}

      <button
        className="link-btn"
        style={{ display: 'block', marginTop: 12 }}
        onClick={restablecerContrasena}
        disabled={enviandoReset}
      >
        {enviandoReset
          ? 'Enviando…'
          : resetEnviado
          ? 'Correo enviado ✓'
          : '🔑 Enviarle correo para cambiar contraseña'}
      </button>
    </div>
  )
}

function FormularioAsignarAdminExistente({ usuariosDisponibles, onAsignar }) {
  const [abierto, setAbierto] = useState(false)
  const [uidElegido, setUidElegido] = useState('')
  const [asignando, setAsignando] = useState(false)
  const [error, setError] = useState('')

  const elegido = usuariosDisponibles.find((u) => u.uid === uidElegido)

  async function confirmar() {
    setError('')
    if (!uidElegido) {
      setError('Elige una cuenta de la lista.')
      return
    }
    setAsignando(true)
    try {
      await onAsignar(uidElegido, elegido?.pueblosAdmin)
      setUidElegido('')
      setAbierto(false)
    } catch {
      setError('No se pudo asignar. Intenta de nuevo.')
    } finally {
      setAsignando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        Asignar admin existente
      </button>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Asignar cuenta existente</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Convierte una cuenta que ya existe en administrador de este
        pueblo. Si ya administraba otro pueblo, conserva ese acceso
        además de este.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label>Cuenta</label>
        <select value={uidElegido} onChange={(e) => setUidElegido(e.target.value)}>
          <option value="">Selecciona una cuenta…</option>
          {usuariosDisponibles.map((u) => (
            <option key={u.uid} value={u.uid}>
              {u.nombre || '(sin nombre)'} — {u.correo} ({u.rol || 'pasajero'})
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={asignando}>
          {asignando ? 'Asignando…' : 'Asignar como admin'}
        </button>
      </div>
    </div>
  )
}

function FormularioNuevoAdmin({ onCrear }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [creando, setCreando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setError('')
    if (!nombre.trim() || !correo.trim()) {
      setError('Completa nombre y correo.')
      return
    }
    setCreando(true)
    try {
      await onCrear({ nombre: nombre.trim(), correo: correo.trim() })
      setEnviado(true)
    } catch (e) {
      setError(mensajeErrorCuenta(e.code))
    } finally {
      setCreando(false)
    }
  }

  function cerrar() {
    setNombre('')
    setCorreo('')
    setEnviado(false)
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <button className="btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        + Invitar administrador
      </button>
    )
  }

  if (enviado) {
    return (
      <div className="card" style={{ flex: '1 1 100%' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>¡Listo! ✓</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Le mandamos un correo a <b>{correo}</b> para que elija su
          contraseña y active su cuenta de administrador.
        </p>
        <button className="btn-primary" onClick={cerrar}>
          Listo
        </button>
      </div>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Invitar administrador</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Va a poder administrar choferes y rutas de este pueblo
        únicamente. Le mandamos un correo para que elija su propia
        contraseña — no necesitas inventarle una.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="field">
        <label>Correo electrónico</label>
        <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={creando}>
          {creando ? 'Enviando…' : 'Invitar'}
        </button>
      </div>
    </div>
  )
}

// ==================== RUTAS ====================

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function rutaVacia() {
  return {
    id: '',
    nombre: '',
    color: '#146c6e',
    paradas: [{ codigo: 'p1', nombre: '', orden: 0, lat: '', lng: '', anclaId: '' }],
  }
}

// Si hay rutas de antes de que existieran los pueblos (guardadas
// sueltas), permite importarlas al pueblo que se está administrando.
// Deja elegir cuáles de las 6 rutas de ejemplo (Vega Baja) importar,
// en vez de todo-o-nada.
function PanelImportarSemilla({ importando, setImportando, onImportar }) {
  const [abierto, setAbierto] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState({})
  const [error, setError] = useState('')

  function alternar(id) {
    setSeleccionadas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function marcarTodas(valor) {
    setSeleccionadas(Object.fromEntries(RUTAS_SEMILLA.map((r) => [r.id, valor])))
  }

  async function confirmar() {
    setError('')
    const aImportar = RUTAS_SEMILLA.filter((r) => seleccionadas[r.id])
    if (!aImportar.length) return
    setImportando(true)
    try {
      await onImportar(aImportar)
      setAbierto(false)
      setSeleccionadas({})
    } catch {
      setError('No se pudo importar. Intenta de nuevo.')
    } finally {
      setImportando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setAbierto(true)}>
        📚 Importar datos de ejemplo
      </button>
    )
  }

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        Marca cuáles rutas de ejemplo (del sistema de Vega Baja) quieres
        copiar a este pueblo para empezar a editarlas.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="pueblos-checkbox-list" style={{ marginBottom: 14 }}>
        {RUTAS_SEMILLA.map((r) => (
          <label key={r.id} className="pueblo-checkbox">
            <input
              type="checkbox"
              checked={!!seleccionadas[r.id]}
              onChange={() => alternar(r.id)}
            />
            <span className="stop-dot" style={{ background: r.color }} />
            {r.nombre} ({r.paradas.length} paradas)
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="link-btn" onClick={() => marcarTodas(true)}>
          Marcar todas
        </button>
        <button className="link-btn" onClick={() => marcarTodas(false)}>
          Ninguna
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" onClick={() => setAbierto(false)} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button
          className="btn-primary"
          onClick={confirmar}
          disabled={importando || !Object.values(seleccionadas).some(Boolean)}
          style={{ flex: 1 }}
        >
          {importando ? 'Importando…' : 'Importar seleccionadas'}
        </button>
      </div>
    </div>
  )
}

function PanelImportarRutas({ importando, setImportando, onImportar }) {
  const huerfanas = useRutasHuerfanas()
  const [abierto, setAbierto] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState({})

  if (huerfanas === null || !huerfanas.length) return null

  function alternar(id) {
    setSeleccionadas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  async function confirmar() {
    const aImportar = huerfanas.filter((r) => seleccionadas[r.id])
    if (!aImportar.length) return
    setImportando(true)
    try {
      await onImportar(aImportar)
      setAbierto(false)
      setSeleccionadas({})
    } finally {
      setImportando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={() => setAbierto(true)}>
        📥 Importar rutas que ya tenía ({huerfanas.length})
      </button>
    )
  }

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        Encontramos {huerfanas.length} ruta(s) guardadas de antes.
        Marca las que quieras copiar a este pueblo.
      </p>
      <div className="pueblos-checkbox-list" style={{ marginBottom: 14 }}>
        {huerfanas.map((r) => (
          <label key={r.id} className="pueblo-checkbox">
            <input
              type="checkbox"
              checked={!!seleccionadas[r.id]}
              onChange={() => alternar(r.id)}
            />
            <span className="stop-dot" style={{ background: r.color }} />
            {r.nombre} ({r.paradas.length} paradas)
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" onClick={() => setAbierto(false)} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button
          className="btn-primary"
          onClick={confirmar}
          disabled={importando || !Object.values(seleccionadas).some(Boolean)}
          style={{ flex: 1 }}
        >
          {importando ? 'Importando…' : 'Importar seleccionadas'}
        </button>
      </div>
    </div>
  )
}

function PanelRutas({ puebloId }) {
  const { rutas, guardarRuta, eliminarRuta, usandoSemilla, importarRutas } = useRoutesForPueblo(puebloId)
  const [editando, setEditando] = useState(null)
  const [importandoSemilla, setImportandoSemilla] = useState(false)
  const [importandoHuerfanas, setImportandoHuerfanas] = useState(false)

  if (editando) {
    return <EditorRuta ruta={editando} onCerrar={() => setEditando(null)} onGuardar={guardarRuta} />
  }

  // Mientras el pueblo no tenga rutas propias, 'rutas' trae el
  // respaldo de ejemplo (Vega Baja) — no lo mostramos como si fuera
  // del pueblo, porque confunde. Solo mostramos la lista real.
  const rutasReales = usandoSemilla ? [] : rutas

  return (
    <div>
      {usandoSemilla && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0, marginBottom: 0 }}>
            Este pueblo todavía no tiene rutas propias. Puedes importar
            algunas de ejemplo para empezar, o crear las tuyas desde cero.
          </p>
        </div>
      )}

      <PanelImportarSemilla
        importando={importandoSemilla}
        setImportando={setImportandoSemilla}
        onImportar={importarRutas}
      />

      <PanelImportarRutas
        importando={importandoHuerfanas}
        setImportando={setImportandoHuerfanas}
        onImportar={importarRutas}
      />

      <button className="btn-primary" style={{ marginBottom: 16 }} onClick={() => setEditando(rutaVacia())}>
        + Crear ruta nueva
      </button>

      {!rutasReales.length && (
        <p className="empty-state">Todavía no hay rutas en este pueblo.</p>
      )}

      {rutasReales.map((r) => (
        <div className="card" key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="stop-dot" style={{ background: r.color, width: 14, height: 14 }} />
          <div style={{ flex: 1 }}>
            <b>{r.nombre}</b>
            <div className="hint" style={{ margin: 0 }}>{r.paradas.length} paradas</div>
          </div>
          <button className="link-btn" onClick={() => setEditando(r)}>
            Editar
          </button>
          <button
            className="link-btn"
            style={{ color: '#a83226' }}
            onClick={() => {
              if (confirm(`¿Borrar "${r.nombre}"? Esto no se puede deshacer.`)) {
                eliminarRuta(r.id)
              }
            }}
          >
            Borrar
          </button>
        </div>
      ))}
    </div>
  )
}

function EditorRuta({ ruta, onCerrar, onGuardar }) {
  const esNueva = !ruta.id
  const [nombre, setNombre] = useState(ruta.nombre)
  const [color, setColor] = useState(ruta.color)
  const [paradas, setParadas] = useState(ruta.paradas.map((p) => ({ ...p })))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  function actualizarParada(idx, campo, valor) {
    setParadas((prev) => prev.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)))
  }

  function agregarParada() {
    const maxOrden = paradas.reduce((m, p) => Math.max(m, Number(p.orden) || 0), 0)
    setParadas((prev) => [
      ...prev,
      { codigo: `p${prev.length + 1}`, nombre: '', orden: maxOrden + 5, lat: '', lng: '', anclaId: '' },
    ])
  }

  function quitarParada(idx) {
    setParadas((prev) => prev.filter((_, i) => i !== idx))
  }

  function moverParada(idx, direccion) {
    setParadas((prev) => {
      const nuevo = [...prev]
      const destino = idx + direccion
      if (destino < 0 || destino >= nuevo.length) return prev
      ;[nuevo[idx], nuevo[destino]] = [nuevo[destino], nuevo[idx]]
      return nuevo
    })
  }

  async function guardar() {
    setError('')
    if (!nombre.trim()) {
      setError('Ponle un nombre a la ruta.')
      return
    }
    if (paradas.some((p) => !p.nombre.trim())) {
      setError('Todas las paradas necesitan un nombre.')
      return
    }
    const id = esNueva ? slugificar(nombre) || `ruta-${Date.now()}` : ruta.id

    const paradasLimpias = paradas.map((p, i) => ({
      codigo: p.codigo || `p${i + 1}`,
      nombre: p.nombre.trim(),
      orden: Number(p.orden) || i,
      ...(p.lat !== '' && p.lng !== '' && p.lat != null && p.lng != null
        ? { lat: Number(p.lat), lng: Number(p.lng) }
        : {}),
      ...(p.anclaId?.trim() ? { anclaId: p.anclaId.trim() } : {}),
    }))

    setGuardando(true)
    try {
      await onGuardar({ id, nombre: nombre.trim(), color, paradas: paradasLimpias })
      onCerrar()
    } catch (e) {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <button className="link-btn" style={{ marginBottom: 14 }} onClick={onCerrar}>
        ← Volver a la lista
      </button>

      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          {esNueva ? 'Nueva ruta' : `Editar: ${ruta.nombre}`}
        </h2>

        {error && <div className="error-banner">{error}</div>}

        <div className="field">
          <label>Nombre de la ruta</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Ruta 7 - Centro" />
        </div>

        <div className="field">
          <label>Color en el mapa</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ height: 44, padding: 4 }}
          />
        </div>

        <p className="hint" style={{ marginTop: 0 }}>
          Para las paradas importantes (donde el trolley realmente pasa),
          pon su latitud y longitud reales — puedes obtenerlas dándole clic
          derecho al lugar en Google Maps y copiando las coordenadas. Las
          paradas sin coordenadas se ubican automáticamente a mitad de
          camino entre las dos paradas conocidas más cercanas. Si dos
          paradas de rutas distintas son el mismo lugar físico (punto de
          transbordo), ponles el mismo texto en "Palabra clave".
        </p>

        {paradas.map((p, idx) => (
          <div key={idx} className="parada-editor-row">
            <div className="parada-editor-grid">
              <input
                placeholder="Nombre de la parada"
                value={p.nombre}
                onChange={(e) => actualizarParada(idx, 'nombre', e.target.value)}
              />
              <input
                type="number"
                placeholder="Orden"
                value={p.orden}
                onChange={(e) => actualizarParada(idx, 'orden', e.target.value)}
                style={{ width: 70 }}
              />
              <input
                type="number"
                step="any"
                placeholder="Latitud (opcional)"
                value={p.lat}
                onChange={(e) => actualizarParada(idx, 'lat', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Longitud (opcional)"
                value={p.lng}
                onChange={(e) => actualizarParada(idx, 'lng', e.target.value)}
              />
              <input
                placeholder="Palabra clave (opcional)"
                value={p.anclaId}
                onChange={(e) => actualizarParada(idx, 'anclaId', e.target.value)}
              />
            </div>
            <div className="parada-editor-acciones">
              <button type="button" onClick={() => moverParada(idx, -1)} disabled={idx === 0}>
                ↑
              </button>
              <button type="button" onClick={() => moverParada(idx, 1)} disabled={idx === paradas.length - 1}>
                ↓
              </button>
              <button type="button" onClick={() => quitarParada(idx)} className="quitar">
                ✕
              </button>
            </div>
          </div>
        ))}

        <button className="btn-secondary" style={{ marginBottom: 16 }} onClick={agregarParada}>
          + Agregar parada
        </button>

        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar ruta'}
        </button>
      </div>
    </div>
  )
}

// ==================== PUBLICIDAD POR PARADA ====================

function PanelPublicidad({ puebloId }) {
  const { rutas } = useRoutesForPueblo(puebloId)
  const { banners, guardarBanner, eliminarBanner } = useBannersForPueblo(puebloId)
  const [rutaId, setRutaId] = useState('')
  const [codigoParada, setCodigoParada] = useState('')
  const [creandoNuevo, setCreandoNuevo] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  const rutaElegida = rutas.find((r) => r.id === rutaId)
  const paradaElegida = rutaElegida?.paradas.find((p) => p.codigo === codigoParada)
  const clave = rutaElegida && paradaElegida ? claveParada(rutaElegida.id, paradaElegida) : null
  const bannersDeParada = clave ? Object.entries(banners[clave] || {}) : []

  const listaBannersTodos = useMemo(() => {
    return Object.entries(banners).flatMap(([clave, porParada]) =>
      Object.entries(porParada || {}).map(([bannerId, b]) => ({ clave, bannerId, ...b }))
    ).sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0))
  }, [banners])

  function alGuardar() {
    setCreandoNuevo(false)
    setEditandoId(null)
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Anuncios en una parada
        </h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Elige una ruta y una parada. Puedes poner varios anuncios en la
          misma parada. Si esa parada es compartida por varias rutas
          (punto de transbordo), los anuncios se ven igual desde
          cualquiera de ellas.
        </p>

        <div className="field">
          <label>Ruta</label>
          <select
            value={rutaId}
            onChange={(e) => {
              setRutaId(e.target.value)
              setCodigoParada('')
              setCreandoNuevo(false)
              setEditandoId(null)
            }}
          >
            <option value="">Selecciona una ruta…</option>
            {rutas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>

        {rutaElegida && (
          <div className="field">
            <label>Parada</label>
            <select
              value={codigoParada}
              onChange={(e) => {
                setCodigoParada(e.target.value)
                setCreandoNuevo(false)
                setEditandoId(null)
              }}
            >
              <option value="">Selecciona una parada…</option>
              {rutaElegida.paradas.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {clave && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            {bannersDeParada.map(([bannerId, b]) =>
              editandoId === bannerId ? (
                <FormularioBanner
                  key={bannerId}
                  clave={clave}
                  bannerId={bannerId}
                  nombreParada={paradaElegida.nombre}
                  rutaNombre={rutaElegida.nombre}
                  existente={b}
                  onGuardar={guardarBanner}
                  onListo={alGuardar}
                  onCancelar={() => setEditandoId(null)}
                />
              ) : (
                <div
                  className="card"
                  key={bannerId}
                  style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ flex: 1 }}>
                    <b>{b.titulo}</b>
                    {b.activo === false && <span className="hint"> · (pausado)</span>}
                    {b.lat != null && <div className="hint" style={{ margin: 0 }}>📍 tiene ubicación en el mapa</div>}
                  </div>
                  <button className="link-btn" onClick={() => setEditandoId(bannerId)}>
                    Editar
                  </button>
                  <button
                    className="link-btn"
                    style={{ color: '#a83226' }}
                    onClick={() => {
                      if (confirm(`¿Borrar el anuncio "${b.titulo}"?`)) {
                        eliminarBanner(clave, bannerId, b)
                      }
                    }}
                  >
                    Borrar
                  </button>
                </div>
              )
            )}

            {creandoNuevo ? (
              <FormularioBanner
                clave={clave}
                bannerId={null}
                nombreParada={paradaElegida.nombre}
                rutaNombre={rutaElegida.nombre}
                existente={null}
                onGuardar={guardarBanner}
                onListo={alGuardar}
                onCancelar={() => setCreandoNuevo(false)}
              />
            ) : (
              <button className="btn-primary" onClick={() => setCreandoNuevo(true)}>
                + Agregar anuncio a esta parada
              </button>
            )}
          </div>
        )}
      </div>

      {!listaBannersTodos.length && (
        <p className="empty-state">Todavía no hay anuncios en este pueblo.</p>
      )}
    </div>
  )
}

function FormularioBanner({ clave, bannerId, nombreParada, rutaNombre, existente, onGuardar, onListo, onCancelar }) {
  const [titulo, setTitulo] = useState(existente?.titulo || '')
  const [descripcion, setDescripcion] = useState(existente?.descripcion || '')
  const [imagenUrl, setImagenUrl] = useState(existente?.imagenUrl || '')
  const [enlace, setEnlace] = useState(existente?.enlace || '')
  const [lat, setLat] = useState(existente?.lat ?? '')
  const [lng, setLng] = useState(existente?.lng ?? '')
  const [precio, setPrecio] = useState(existente?.precio ?? '')
  const [activo, setActivo] = useState(existente?.activo !== false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!titulo.trim()) {
      setError('Ponle un título al anuncio (ej. el nombre del negocio).')
      return
    }
    setGuardando(true)
    try {
      await onGuardar(clave, bannerId, {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        imagenUrl: imagenUrl.trim(),
        enlace: enlace.trim(),
        ...(lat !== '' && lng !== '' ? { lat: Number(lat), lng: Number(lng) } : {}),
        ...(precio !== '' ? { precio: Number(precio) } : {}),
        activo,
        nombreParada,
        rutaNombre,
      })
      onListo()
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="card">
      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label>Título (ej. nombre del negocio)</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Panadería El Buen Pan" />
      </div>
      <div className="field">
        <label>Descripción corta</label>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="2x1 en pan de agua todos los lunes"
        />
      </div>
      <div className="field">
        <label>URL de imagen (opcional)</label>
        <input value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label>Enlace externo al tocar el anuncio (opcional)</label>
        <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://…" />
      </div>
      <div className="field">
        <label>Cuánto le cobras al negocio por este anuncio (opcional, mensual $)</label>
        <input
          type="number"
          step="any"
          min="0"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="Ej. 50"
        />
        <p className="hint" style={{ margin: '4px 0 0' }}>
          No lo ve el pasajero — solo se usa para calcular la tarifa que
          le corresponde a la plataforma en el panel de Facturación.
        </p>
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        Opcional: coordenadas del negocio (clic derecho en Google Maps →
        copiar coordenadas). Si las pones, el pasajero podrá tocar el
        anuncio para ver ese punto exacto en el mapa.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Latitud</label>
          <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="18.4130" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Longitud</label>
          <input type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-66.3944" />
        </div>
      </div>

      <div className="role-toggle" style={{ marginBottom: 16 }}>
        <button type="button" className={activo ? 'active' : ''} onClick={() => setActivo(true)}>
          Activo
        </button>
        <button type="button" className={!activo ? 'active' : ''} onClick={() => setActivo(false)}>
          Pausado
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={onCancelar}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Crear anuncio'}
        </button>
      </div>
    </div>
  )
}

// ==================== FACTURACIÓN DE PUBLICIDAD (solo superadmin) ====================

function PanelFacturacion() {
  const { pueblos } = usePueblo()

  return (
    <div>
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Facturación de publicidad
        </h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Configura cómo le cobras a cada pueblo por su módulo de
          publicidad, y lleva registro de los pagos que te hagan.
        </p>
      </div>

      {!pueblos.length && <p className="empty-state">Todavía no has creado ningún pueblo.</p>}

      {pueblos.map((p) => (
        <FilaFacturacionPueblo key={p.id} pueblo={p} />
      ))}
    </div>
  )
}

function mesesRecientes(cantidad) {
  const ahora = new Date()
  const lista = []
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
    const inicio = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    const etiqueta = d.toLocaleDateString('es-PR', { month: 'long', year: 'numeric' })
    lista.push({ clave: `${d.getFullYear()}-${d.getMonth()}`, etiqueta, inicio, fin })
  }
  return lista
}

function FilaFacturacionPueblo({ pueblo }) {
  const { actualizarTarifaPublicidad } = usePueblo()
  const { historial } = useHistorialAnuncios(pueblo.id)

  const opcionesMes = useMemo(() => mesesRecientes(6), [])
  const [mesElegido, setMesElegido] = useState(opcionesMes[0].clave)
  const mes = opcionesMes.find((m) => m.clave === mesElegido) || opcionesMes[0]
  const finEfectivo = Math.min(mes.fin, Date.now())
  const diasEnMes = (mes.fin - mes.inicio) / (24 * 60 * 60 * 1000)

  const [tipoTarifa, setTipoTarifa] = useState(pueblo.tarifaPublicidad?.tipo || 'fijo_por_anuncio')
  const [valorTarifa, setValorTarifa] = useState(pueblo.tarifaPublicidad?.valor ?? '')
  const [guardandoTarifa, setGuardandoTarifa] = useState(false)
  const [tarifaGuardada, setTarifaGuardada] = useState(false)

  const [pagos, setPagos] = useState(null)
  const [montoNuevo, setMontoNuevo] = useState('')
  const [notaNueva, setNotaNueva] = useState('')
  const [registrando, setRegistrando] = useState(false)

  useEffect(() => {
    const pagosRef = ref(db, `pagosPublicidad/${pueblo.id}`)
    const unsub = onValue(pagosRef, (snap) => setPagos(snap.exists() ? snap.val() : {}))
    return unsub
  }, [pueblo.id])

  // Calculado a partir del HISTORIAL permanente — cuenta los días que
  // cada anuncio estuvo activo dentro del mes elegido, sin importar si
  // ahora mismo está pausado o borrado. Así nadie puede pagar menos
  // apagando sus anuncios justo antes de la fecha de cobro.
  const anunciosDelMes = useMemo(
    () => calcularDiasActivosPorAnuncio(historial, mes.inicio, finEfectivo),
    [historial, mes.inicio, finEfectivo]
  )
  const conActividad = anunciosDelMes.filter((a) => a.diasActivo > 0)
  const equivalenteAnuncios = conActividad.reduce((acc, a) => acc + a.diasActivo / diasEnMes, 0)
  const ingresoReportadoProrrateado = conActividad.reduce(
    (acc, a) => acc + (Number(a.precio) || 0) * (a.diasActivo / diasEnMes),
    0
  )

  const feeCalculado =
    tipoTarifa === 'porcentaje'
      ? (ingresoReportadoProrrateado * (Number(valorTarifa) || 0)) / 100
      : equivalenteAnuncios * (Number(valorTarifa) || 0)

  async function guardarTarifa() {
    setGuardandoTarifa(true)
    setTarifaGuardada(false)
    try {
      await actualizarTarifaPublicidad(pueblo.id, {
        tipo: tipoTarifa,
        valor: Number(valorTarifa) || 0,
      })
      setTarifaGuardada(true)
    } finally {
      setGuardandoTarifa(false)
    }
  }

  async function registrarPago() {
    if (!montoNuevo || Number(montoNuevo) <= 0) return
    setRegistrando(true)
    try {
      const nuevaRef = push(ref(db, `pagosPublicidad/${pueblo.id}`))
      await set(nuevaRef, {
        monto: Number(montoNuevo),
        notas: notaNueva.trim(),
        mes: mes.etiqueta,
        fecha: Date.now(),
      })
      setMontoNuevo('')
      setNotaNueva('')
    } finally {
      setRegistrando(false)
    }
  }

  const listaPagos = useMemo(() => {
    if (!pagos) return []
    return Object.entries(pagos)
      .map(([id, p]) => ({ id, ...p }))
      .sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
  }, [pagos])

  return (
    <div className="card">
      <b style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem' }}>{pueblo.nombre}</b>

      <div className="field" style={{ marginTop: 12 }}>
        <label>Mes a facturar</label>
        <select value={mesElegido} onChange={(e) => setMesElegido(e.target.value)}>
          {opcionesMes.map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="value">{equivalenteAnuncios.toFixed(1)}</div>
          <div className="label">Anuncios-mes equivalentes</div>
        </div>
        <div className="stat">
          <div className="value">${ingresoReportadoProrrateado.toFixed(0)}</div>
          <div className="label">Ingreso reportado (prorrateado)</div>
        </div>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Calculado con base en cuántos días cada anuncio estuvo
        realmente activo durante {mes.etiqueta} — no importa si ahora
        mismo está pausado o borrado, cuenta igual.
      </p>

      <div className="field">
        <label>Modelo de tarifa para este pueblo</label>
        <select value={tipoTarifa} onChange={(e) => setTipoTarifa(e.target.value)}>
          <option value="fijo_por_anuncio">Fijo por anuncio activo</option>
          <option value="porcentaje">Porcentaje del ingreso reportado</option>
        </select>
      </div>
      <div className="field">
        <label>{tipoTarifa === 'porcentaje' ? 'Porcentaje (%)' : 'Monto por anuncio ($/mes)'}</label>
        <input
          type="number"
          step="any"
          min="0"
          value={valorTarifa}
          onChange={(e) => setValorTarifa(e.target.value)}
          placeholder={tipoTarifa === 'porcentaje' ? 'Ej. 20' : 'Ej. 5'}
        />
      </div>
      <button className="btn-secondary" onClick={guardarTarifa} disabled={guardandoTarifa}>
        {guardandoTarifa ? 'Guardando…' : tarifaGuardada ? 'Guardado ✓' : 'Guardar tarifa'}
      </button>

      <div className="stat" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="value">${feeCalculado.toFixed(2)}</div>
        <div className="label">Fee de {mes.etiqueta}</div>
      </div>

      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <p className="hint" style={{ marginTop: 0, fontWeight: 700, textTransform: 'uppercase' }}>
          Registrar un pago recibido
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="Monto ($)"
            value={montoNuevo}
            onChange={(e) => setMontoNuevo(e.target.value)}
            style={{
              flex: 1,
              border: '1.5px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              background: 'var(--cream-100)',
            }}
          />
          <button className="btn-primary" onClick={registrarPago} disabled={registrando} style={{ flex: 1 }}>
            {registrando ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
        <input
          placeholder="Nota (opcional)"
          value={notaNueva}
          onChange={(e) => setNotaNueva(e.target.value)}
          style={{
            width: '100%',
            border: '1.5px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            background: 'var(--cream-100)',
            marginBottom: 12,
          }}
        />

        {listaPagos.length > 0 && (
          <div>
            <p className="hint" style={{ margin: '0 0 6px' }}>Historial de pagos:</p>
            {listaPagos.slice(0, 6).map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.85rem',
                  padding: '4px 0',
                }}
              >
                <span>
                  {p.mes || new Date(p.fecha).toLocaleDateString('es-PR')}
                  {p.notas ? ` — ${p.notas}` : ''}
                </span>
                <b>${Number(p.monto).toFixed(2)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


// ==================== PUEBLOS (solo superadmin) ====================

function PanelPueblos({ onAdministrar }) {
  const { pueblos, crearPueblo, eliminarPueblo } = usePueblo()
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  async function onCrear() {
    setError('')
    if (!nombreNuevo.trim()) {
      setError('Escribe el nombre del pueblo.')
      return
    }
    setCreando(true)
    try {
      const id = await crearPueblo(nombreNuevo.trim(), lat, lng)
      setNombreNuevo('')
      setLat('')
      setLng('')
      // Lleva directo a configurar las rutas del pueblo recién creado.
      onAdministrar?.(id, 'rutas')
    } catch {
      setError('No se pudo crear. Intenta de nuevo.')
    } finally {
      setCreando(false)
    }
  }

  return (
    <div>
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Nuevo pueblo</h2>
        {error && <div className="error-banner">{error}</div>}
        <div className="field">
          <label>Nombre</label>
          <input
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Ej. Trolley Vega Baja"
          />
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Opcional: dale las coordenadas del centro del pueblo (clic
          derecho en Google Maps → copiar coordenadas) para que el mapa
          arranque enfocado ahí. Si lo dejas en blanco, arranca con una
          vista general de Puerto Rico.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Latitud</label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="18.4130"
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Longitud</label>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-66.3944"
            />
          </div>
        </div>
        <button className="btn-primary" onClick={onCrear} disabled={creando}>
          {creando ? 'Creando…' : '+ Crear pueblo'}
        </button>
      </div>

      {!pueblos.length && <p className="empty-state">Todavía no has creado ningún pueblo.</p>}

      {pueblos.map((p) => (
        <div className="card" key={p.id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <b style={{ flex: 1 }}>{p.nombre}</b>
            <button
              className="link-btn"
              style={{ color: '#a83226' }}
              onClick={() => {
                if (
                  confirm(
                    `¿Borrar "${p.nombre}"? Esto también borra sus rutas y choferes activos. No se puede deshacer.`
                  )
                ) {
                  eliminarPueblo(p.id)
                }
              }}
            >
              Borrar
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => onAdministrar?.(p.id, 'rutas')}
            >
              🗺️ Rutas
            </button>
            <button
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => onAdministrar?.(p.id, 'choferes')}
            >
              🚋 Choferes
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== USUARIOS (solo superadmin) ====================

function PanelUsuarios() {
  const { pueblos } = usePueblo()
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const usuariosRef = ref(db, 'usuarios')
    const unsub = onValue(
      usuariosRef,
      (snap) => setUsuarios(snap.exists() ? snap.val() : {}),
      () => setError('No se pudo leer la lista de usuarios.')
    )
    return unsub
  }, [])

  const lista = useMemo(() => {
    if (!usuarios) return []
    return Object.entries(usuarios)
      .map(([uid, u]) => ({ uid, ...u }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'))
  }, [usuarios])

  async function guardarUsuario(uid, cambios) {
    await update(ref(db, `usuarios/${uid}`), cambios)
  }

  if (error) return <div className="error-banner">{error}</div>
  if (usuarios === null) return <p className="empty-state">Cargando usuarios…</p>

  return (
    <div>
      {lista.map((u) => (
        <FilaUsuario key={u.uid} usuario={u} pueblos={pueblos} onGuardar={guardarUsuario} />
      ))}
    </div>
  )
}

function FilaUsuario({ usuario, pueblos, onGuardar }) {
  const [rol, setRol] = useState(usuario.rol || 'pasajero')
  const [pueblosAdmin, setPueblosAdmin] = useState(usuario.pueblosAdmin || {})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [enviandoReset, setEnviandoReset] = useState(false)
  const [resetEnviado, setResetEnviado] = useState(false)
  const [errorReset, setErrorReset] = useState('')

  function alternarPueblo(id) {
    setPueblosAdmin((prev) => {
      const nuevo = { ...prev }
      if (nuevo[id]) delete nuevo[id]
      else nuevo[id] = true
      return nuevo
    })
  }

  async function guardar() {
    setGuardando(true)
    setGuardado(false)
    try {
      await onGuardar(usuario.uid, {
        rol,
        pueblosAdmin: rol === 'admin' ? pueblosAdmin : null,
      })
      setGuardado(true)
    } finally {
      setGuardando(false)
    }
  }

  async function restablecerContrasena() {
    setErrorReset('')
    setResetEnviado(false)
    setEnviandoReset(true)
    try {
      await enviarRestablecerContrasena(usuario.correo)
      setResetEnviado(true)
    } catch {
      setErrorReset('No se pudo enviar el correo.')
    } finally {
      setEnviandoReset(false)
    }
  }

  const hayCambios =
    rol !== (usuario.rol || 'pasajero') ||
    JSON.stringify(pueblosAdmin) !== JSON.stringify(usuario.pueblosAdmin || {})

  return (
    <div className="card">
      <b>{usuario.nombre || '(sin nombre)'}</b>
      <p className="hint" style={{ marginTop: 2 }}>{usuario.correo}</p>

      <div className="field">
        <label>Rol</label>
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="pasajero">Pasajero</option>
          <option value="chofer">Chofer</option>
          <option value="admin">Admin de pueblo(s)</option>
          <option value="superadmin">Super admin (todo)</option>
        </select>
      </div>

      {rol === 'admin' && (
        <div className="field">
          <label>Pueblos que administra</label>
          <div className="pueblos-checkbox-list">
            {pueblos.map((p) => (
              <label key={p.id} className="pueblo-checkbox">
                <input
                  type="checkbox"
                  checked={!!pueblosAdmin[p.id]}
                  onChange={() => alternarPueblo(p.id)}
                />
                {p.nombre}
              </label>
            ))}
            {!pueblos.length && (
              <p className="hint" style={{ margin: 0 }}>
                Primero crea un pueblo en la pestaña "Pueblos".
              </p>
            )}
          </div>
        </div>
      )}

      {errorReset && <div className="error-banner">{errorReset}</div>}

      <button className="btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
      </button>

      <button
        className="link-btn"
        style={{ display: 'block', marginTop: 12 }}
        onClick={restablecerContrasena}
        disabled={enviandoReset}
      >
        {enviandoReset
          ? 'Enviando…'
          : resetEnviado
          ? 'Correo enviado ✓'
          : '🔑 Enviarle correo para cambiar contraseña'}
      </button>
    </div>
  )
}
