import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    // MUI pulls in react-transition-group via a directory import, which Node
    // cannot resolve when the dep is externalised - inline it so Vite resolves it.
    server: { deps: { inline: ['@mui/material'] } },
  },
})
