import { Component } from 'react'

// Si algo falla al construir la pantalla (un error inesperado en el
// código), React normalmente deja la página en blanco. Este
// "Error Boundary" lo detecta y muestra un mensaje con un botón para
// reintentar, en vez de una pantalla en blanco sin explicación.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null, mostrarDetalles: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Queda registrado en la consola por si hace falta diagnosticar.
    console.error('Error atrapado por ErrorBoundary:', error, info)
    this.setState({ info })
  }

  componentDidMount() {
    // Algunos errores (por ejemplo, dentro de un efecto que actualiza
    // el mapa) no los atrapa React automáticamente — con esto también
    // quedan capturados, en vez de dejar la pantalla en blanco.
    this.onWindowError = (event) => {
      this.setState({ error: event.error || new Error(event.message) })
    }
    this.onRechazoNoManejado = (event) => {
      this.setState({ error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)) })
    }
    window.addEventListener('error', this.onWindowError)
    window.addEventListener('unhandledrejection', this.onRechazoNoManejado)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError)
    window.removeEventListener('unhandledrejection', this.onRechazoNoManejado)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell">
          <div className="screen" style={{ justifyContent: 'center', textAlign: 'center' }}>
            <div className="card">
              <h2 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>
                Algo salió mal
              </h2>
              <p className="hint">
                Ocurrió un error inesperado. Intenta de nuevo — si sigue
                pasando, avísale al administrador.
              </p>
              <button
                className="btn-primary"
                onClick={() => {
                  this.setState({ error: null, info: null })
                  window.location.reload()
                }}
              >
                Reintentar
              </button>

              <button
                className="link-btn"
                style={{ display: 'block', marginTop: 16 }}
                onClick={() => this.setState((s) => ({ mostrarDetalles: !s.mostrarDetalles }))}
              >
                {this.state.mostrarDetalles ? 'Ocultar' : 'Ver'} detalles técnicos
              </button>

              {this.state.mostrarDetalles && (
                <pre
                  style={{
                    textAlign: 'left',
                    fontSize: '0.72rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: 'var(--cream-200)',
                    padding: 12,
                    borderRadius: 8,
                    marginTop: 12,
                    maxHeight: 260,
                    overflow: 'auto',
                  }}
                >
                  {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
                  {this.state.info?.componentStack || ''}
                </pre>
              )}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
