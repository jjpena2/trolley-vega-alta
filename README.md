# 🚋 Trolley Vega Alta

App móvil (funciona como app web instalable, "PWA") para rastrear en vivo
los trolleys de Vega Alta, Puerto Rico. Funciona en **iPhone y Android**
desde el mismo navegador — no requiere subirla a App Store ni Play Store.

- **Pasajeros**: ven un mapa en vivo con los trolleys que están en servicio.
- **Choferes**: se registran, inician sesión, y con un botón activan su
  ubicación en tiempo real mientras conducen.

---

## 1. Cómo funciona por dentro

- **Frontend:** React + Vite (rápido de compilar, fácil de mantener).
- **Mapa:** Leaflet + OpenStreetMap (gratis, sin necesidad de API key).
- **Cuentas y ubicación en vivo:** Firebase (plan gratuito "Spark" es
  suficiente) — Authentication + Realtime Database.
- **Hospedaje:** GitHub Pages, publicado automáticamente con GitHub Actions
  cada vez que subes cambios a la rama `main`.

---

## 2. Crear el proyecto de Firebase (una sola vez)

1. Entra a [console.firebase.google.com](https://console.firebase.google.com)
   y crea un proyecto nuevo (gratis).
2. Dentro del proyecto, click en el ícono **`</>`** ("Agregar app web").
   Ponle el nombre que quieras y presiona "Registrar app".
3. Firebase te muestra un objeto `firebaseConfig`. Cópialo — lo vas a
   necesitar en el paso 4.
4. En el menú izquierdo:
   - **Authentication → Sign-in method →** activa **Correo/contraseña**.
   - **Realtime Database → Crear base de datos →** elige una región
     cercana → empieza en **modo de prueba** (lo aseguramos abajo).
5. En **Realtime Database → Reglas**, reemplaza las reglas por:

   ```json
   {
     "rules": {
       "usuarios": {
         "$uid": {
           ".read": "auth != null && auth.uid == $uid",
           ".write": "auth != null && auth.uid == $uid"
         }
       },
       "choferesActivos": {
         ".read": true,
         "$uid": {
           ".write": "auth != null && auth.uid == $uid"
         }
       }
     }
   }
   ```

   Esto permite que **cualquiera** (pasajeros sin cuenta incluidos) vea
   las ubicaciones activas, pero solo el chofer dueño de su cuenta puede
   escribir su propia ubicación.

6. Abre `src/firebase.js` en el proyecto y reemplaza los valores de
   ejemplo con los de tu `firebaseConfig` real.

---

## 3. Probar localmente (opcional pero recomendado)

Necesitas [Node.js](https://nodejs.org) instalado.

```bash
npm install
npm run dev
```

Abre la dirección que aparece en la terminal (usualmente
`http://localhost:5173`). El GPS solo funciona en `localhost` o en un
sitio con `https`, así que para probar la ubicación en tu celular vas a
necesitar publicarlo (siguiente paso) o usar herramientas como `ngrok`.

---

## 4. Subir el proyecto a GitHub

1. Crea un repositorio nuevo en GitHub (por ejemplo `trolley-vega-alta`).
   **Anota el nombre exacto** — lo necesitas en el próximo paso.
2. Abre `vite.config.js` y cambia la línea:

   ```js
   const REPO_NAME = 'trolley-vega-alta'
   ```

   para que sea idéntico al nombre de tu repositorio (mayúsculas y
   minúsculas incluidas).

3. Desde la carpeta del proyecto:

   ```bash
   git init
   git add .
   git commit -m "Primera version de Trolley Vega Alta"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/trolley-vega-alta.git
   git push -u origin main
   ```

---

## 5. Activar GitHub Pages

1. En GitHub, entra a tu repositorio → **Settings → Pages**.
2. En "Build and deployment", selecciona **Source: GitHub Actions**.
3. Eso es todo — el archivo `.github/workflows/deploy.yml` ya incluido
   se encarga de compilar y publicar la app automáticamente cada vez que
   hagas `git push` a `main`. Revisa la pestaña **Actions** del repo para
   ver el progreso.
4. Cuando termine, tu app estará en:

   ```
   https://TU-USUARIO.github.io/trolley-vega-alta/
   ```

---

## 6. Instalar la app en el celular

Como es una PWA, se "instala" directo desde el navegador, sin tiendas de
apps:

**Android (Chrome):**
1. Abre el enlace de tu app.
2. Toca el menú (⋮) → **"Agregar a pantalla de inicio"** o **"Instalar
   app"**.

**iPhone (Safari — obligatorio usar Safari, no Chrome):**
1. Abre el enlace de tu app en Safari.
2. Toca el ícono de compartir (el cuadrado con la flecha hacia arriba).
3. Selecciona **"Agregar a pantalla de inicio"**.

Una vez instalada, abre igual que cualquier app desde el ícono en la
pantalla principal, sin la barra del navegador.

---

## 7. Usarla en el día a día

- **Choferes:** entran a la app → "Regístrate" → seleccionan "Soy
  chofer" → completan su ruta y teléfono. Luego, cada vez que empiecen
  su turno, tocan **"Comenzar servicio"** (el navegador pedirá permiso
  de ubicación — deben aceptarlo) y dejan la app abierta mientras
  conducen. Al terminar, tocan **"Terminar servicio"**.
- **Pasajeros:** no necesitan cuenta — al abrir la app ven directo el
  mapa con los trolleys activos en Vega Alta.

---

## 8. Estructura del proyecto

```
trolley-vega-alta/
├── src/
│   ├── context/AuthContext.jsx   # Registro, login, sesión
│   ├── pages/Login.jsx
│   ├── pages/Register.jsx
│   ├── pages/PassengerMap.jsx    # Mapa en vivo para pasajeros
│   ├── pages/DriverDashboard.jsx # Panel del chofer (GPS en vivo)
│   ├── firebase.js               # Config de Firebase (edítalo)
│   ├── App.jsx                   # Navegación
│   └── styles.css
├── public/icons/                 # Íconos de la app
├── .github/workflows/deploy.yml  # Publica en GitHub Pages
└── vite.config.js                # Cambia REPO_NAME aquí
```

## 9. Ideas para seguir mejorando

- Mostrar el historial de la ruta recorrida (dejar una línea/rastro).
- Notificar a los pasajeros cuando un trolley esté a X minutos.
- Agregar horarios programados por ruta.
- Panel de administrador para dar de baja choferes.
