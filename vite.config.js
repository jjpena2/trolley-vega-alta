import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// IMPORTANT: change "trolley-vega-alta" below to match your GitHub repo name
// exactly (case-sensitive). This is required so assets load correctly when
// the site is hosted at https://<usuario>.github.io/<repo>/
const REPO_NAME = 'trolley-vega-alta'

export default defineConfig({
  base: `/${REPO_NAME}/`,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Trolley Vega Alta',
        short_name: 'Trolley VA',
        description: 'Rastreo en vivo de los trolleys de Vega Alta, Puerto Rico',
        theme_color: '#146C6E',
        background_color: '#FAF7F0',
        display: 'standalone',
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
