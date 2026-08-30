import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update, set } from 'firebase/database'
import { sendPasswordResetEmail } from 'firebase/auth'
import { db, auth, crearCuentaSinPerderSesion } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePueblo } from '../context/PuebloContext'
import { useRoutesForPueblo, useRutasHuerfanas } from '../context/RoutesContext'
import { useBannersForPueblo } from '../context/BannersContext'
import { RUTAS_SEMILLA, claveParada } from '../data/routesVegaBaja'

// Firebase no deja que un admin le ponga directamente una contraseña
// nueva a otra cuenta (eso requeriría un servidor propio con
// privilegios especiales, que esta app no tiene). Lo que sí podemos
// hacer, de forma segura, es enviarle a esa persona un correo para que
// ELLA elija su nueva contraseña.
async function enviarRestablecerContrasena(correo) {
  await sendPasswordResetEmail(auth, correo)
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

  async function crearChofer({ nombre, correo, contrasena, telefono, rutaId }) {
    const uid = await crearCuentaSinPerderSesion(correo, contrasena)
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
  const [contrasena, setContrasena] = useState('')
  const [telefono, setTelefono] = useState('')
  const [rutaId, setRutaId] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setError('')
    if (!nombre.trim() || !correo.trim() || contrasena.length < 6 || !telefono.trim()) {
      setError('Completa nombre, correo, teléfono, y una contraseña de al menos 6 caracteres.')
      return
    }
    setCreando(true)
    try {
      await onCrear({
        nombre: nombre.trim(),
        correo: correo.trim(),
        contrasena,
        telefono: telefono.trim(),
        rutaId,
      })
      setNombre('')
      setCorreo('')
      setContrasena('')
      setTelefono('')
      setRutaId('')
      setAbierto(false)
    } catch (e) {
      setError(mensajeErrorCuenta(e.code))
    } finally {
      setCreando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        + Agregar chofer
      </button>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Nuevo chofer</h2>
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
        <label>Contraseña inicial</label>
        <input
          type="text"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          placeholder="Mínimo 6 caracteres — compártela con el chofer"
        />
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
          {creando ? 'Creando…' : 'Crear chofer'}
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

// Convierte una cuenta que YA EXISTE (un pasajero, un chofer de otro
// pueblo, etc.) en chofer de este pueblo, sin crear una cuenta nueva.
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

  async function crearAdmin({ nombre, correo, contrasena }) {
    const uid = await crearCuentaSinPerderSesion(correo, contrasena)
    await set(ref(db, `usuarios/${uid}`), {
      nombre,
      correo,
      rol: 'admin',
      pueblosAdmin: { [puebloId]: true },
      habilitado: true,
      creado: Date.now(),
    })
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
  const [contrasena, setContrasena] = useState('')
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setError('')
    if (!nombre.trim() || !correo.trim() || contrasena.length < 6) {
      setError('Completa nombre, correo, y una contraseña de al menos 6 caracteres.')
      return
    }
    setCreando(true)
    try {
      await onCrear({ nombre: nombre.trim(), correo: correo.trim(), contrasena })
      setNombre('')
      setCorreo('')
      setContrasena('')
      setAbierto(false)
    } catch (e) {
      setError(mensajeErrorCuenta(e.code))
    } finally {
      setCreando(false)
    }
  }

  if (!abierto) {
    return (
      <button className="btn-primary" style={{ flex: 1 }} onClick={() => setAbierto(true)}>
        + Agregar administrador
      </button>
    )
  }

  return (
    <div className="card" style={{ flex: '1 1 100%' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Nuevo administrador</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Va a poder administrar choferes y rutas de este pueblo únicamente.
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
        <label>Contraseña inicial</label>
        <input
          type="text"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          placeholder="Mínimo 6 caracteres — compártela con esa persona"
        />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
        <button className="btn-primary" style={{ flex: 1 }} onClick={confirmar} disabled={creando}>
          {creando ? 'Creando…' : 'Crear administrador'}
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

  const rutaElegida = rutas.find((r) => r.id === rutaId)
  const paradaElegida = rutaElegida?.paradas.find((p) => p.codigo === codigoParada)
  const clave = rutaElegida && paradaElegida ? claveParada(rutaElegida.id, paradaElegida) : null

  const listaBanners = useMemo(() => {
    return Object.entries(banners)
      .map(([clave, b]) => ({ clave, ...b }))
      .sort((a, b) => (b.actualizado || 0) - (a.actualizado || 0))
  }, [banners])

  return (
    <div>
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
          Anuncio para una parada
        </h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Elige una ruta y una parada. Si esa parada es compartida por
          varias rutas (punto de transbordo), el anuncio se ve igual
          desde cualquiera de ellas.
        </p>

        <div className="field">
          <label>Ruta</label>
          <select
            value={rutaId}
            onChange={(e) => {
              setRutaId(e.target.value)
              setCodigoParada('')
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
            <select value={codigoParada} onChange={(e) => setCodigoParada(e.target.value)}>
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
          <FormularioBanner
            key={clave}
            clave={clave}
            nombreParada={paradaElegida.nombre}
            rutaNombre={rutaElegida.nombre}
            existente={banners[clave]}
            onGuardar={guardarBanner}
          />
        )}
      </div>

      {!listaBanners.length && (
        <p className="empty-state">Todavía no hay anuncios en este pueblo.</p>
      )}

      {listaBanners.map((b) => (
        <div className="card" key={b.clave} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <b>{b.titulo}</b>
            <div className="hint" style={{ margin: 0 }}>
              📍 {b.nombreParada} {!b.activo && '· (inactivo)'}
            </div>
          </div>
          <button
            className="link-btn"
            style={{ color: '#a83226' }}
            onClick={() => {
              if (confirm(`¿Borrar el anuncio "${b.titulo}"?`)) {
                eliminarBanner(b.clave)
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

function FormularioBanner({ clave, nombreParada, rutaNombre, existente, onGuardar }) {
  const [titulo, setTitulo] = useState(existente?.titulo || '')
  const [descripcion, setDescripcion] = useState(existente?.descripcion || '')
  const [imagenUrl, setImagenUrl] = useState(existente?.imagenUrl || '')
  const [enlace, setEnlace] = useState(existente?.enlace || '')
  const [activo, setActivo] = useState(existente?.activo !== false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!titulo.trim()) {
      setError('Ponle un título al anuncio (ej. el nombre del negocio).')
      return
    }
    setGuardando(true)
    setGuardado(false)
    try {
      await onGuardar(clave, {
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        imagenUrl: imagenUrl.trim(),
        enlace: enlace.trim(),
        activo,
        nombreParada,
        rutaNombre,
      })
      setGuardado(true)
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
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
        <label>Enlace al tocar el anuncio (opcional)</label>
        <input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://…" />
      </div>

      <div className="role-toggle" style={{ marginBottom: 16 }}>
        <button type="button" className={activo ? 'active' : ''} onClick={() => setActivo(true)}>
          Activo
        </button>
        <button type="button" className={!activo ? 'active' : ''} onClick={() => setActivo(false)}>
          Pausado
        </button>
      </div>

      <button className="btn-primary" onClick={guardar} disabled={guardando}>
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : existente ? 'Actualizar anuncio' : 'Crear anuncio'}
      </button>
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
