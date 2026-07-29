import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeModeProvider } from './contexts/ThemeModeContext.jsx'
import './index.css'
import App from './App.jsx'

// ThemeModeProvider owns ThemeProvider + CssBaseline, because the theme object
// itself depends on the active colour scheme.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeModeProvider>
      <App />
    </ThemeModeProvider>
  </StrictMode>,
)
