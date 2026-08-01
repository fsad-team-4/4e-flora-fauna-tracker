import { Box } from '@mui/material'
import { useThemeMode } from '../contexts/ThemeModeContext'
import logoColour from '../assets/em-services-logo.png'
import logoWhite from '../assets/em-services-logo-white.png'

/**
 * The EM Services wordmark.
 *
 * Both files are the company's own assets, downloaded from the header and footer
 * of emservices.com.sg (435x62 and 411x59 PNGs). They are NOT a recreation.
 *
 * TWO VARIANTS, ONE PER SCHEME - this is not decoration. The corporate site uses
 * the colour mark on its white header and a solid-white mark in its dark footer,
 * because the black "SERVICES" wordmark disappears on a dark surface and the
 * white one is invisible on a light one. This app has both schemes, so it needs
 * both files for the same reason.
 *
 * The artwork already reads "EM SERVICES", so callers must not set a wordmark
 * beside it - that would render "EM SERVICES EM Services".
 */
export default function EmServicesLogo({ height = 26, sx }) {
  const { resolvedMode } = useThemeMode()
  return (
    <Box
      component="img"
      src={resolvedMode === 'dark' ? logoWhite : logoColour}
      alt="EM Services"
      sx={{ height, width: 'auto', display: 'block', flexShrink: 0, ...sx }}
    />
  )
}
