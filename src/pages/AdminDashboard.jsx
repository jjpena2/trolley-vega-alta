import { useEffect, useMemo, useState } from 'react'
import { ref, onValue, update } from 'firebase/database'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { usePueblo } from '../context/PuebloContext'
import { useRoutesForPueblo, useRutasHuerfanas } from '../context/RoutesContext'
import { RUTAS_SEMILLA } from '../data/routesVegaBaja'

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

      {tab === 'choferes' && <PanelChoferes puebloId={puebloAdminId} />}
      {tab === 'rutas' && <PanelRutas puebloId={puebloAdminId} />}
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

function PanelChoferes({ puebloId }) {
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

  async function guardarCambios(uid, cambios) {
    await update(ref(db, `usuarios/${uid}`), cambios)
  }

  if (error) return <div className="error-banner">{error}</div>
  if (usuarios === null) return <p className="empty-state">Cargando choferes…</p>
  if (!choferes.length)
    return <p className="empty-state">Todavía no hay choferes registrados en este pueblo.</p>

  return (
    <div>
      {choferes.map((c) => (
        <FilaChofer key={c.uid} chofer={c} rutas={rutas} onGuardar={guardarCambios} />
      ))}
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

      <button className="btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
      </button>
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

// ==================== PUEBLOS (solo superadmin) ====================

function PanelPueblos({ onAdministrar }) {
  const { pueblos, crearPueblo, eliminarPueblo } = usePueblo()
  const [nombreNuevo, setNombreNuevo] = useState('')
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
      const id = await crearPueblo(nombreNuevo.trim())
      setNombreNuevo('')
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

      <button className="btn-primary" onClick={guardar} disabled={guardando || !hayCambios}>
        {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
      </button>
    </div>
  )
}
