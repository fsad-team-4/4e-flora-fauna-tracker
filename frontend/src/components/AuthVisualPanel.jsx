import { Box, Typography } from '@mui/material';
import { BRAND } from '../theme';

// Right-hand visual panel for the split-screen auth pages (Login/Register).
// Original line-art botanical illustration (hand-authored SVG paths) - no
// stock photography, no third-party artwork. Hidden below md so the form
// column gets full width on small screens.
export default function AuthVisualPanel() {
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'flex' },
        flex: '0 0 58%',
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'flex-end',
        background: `linear-gradient(160deg, ${BRAND.primaryLight} 0%, ${BRAND.primary} 45%, ${BRAND.primaryHover} 100%)`,
      }}
    >
      <svg
        viewBox="0 0 600 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <path id="auth-leaf" d="M50 6 C24 34 10 72 10 104 C10 138 27 154 50 158 C73 154 90 138 90 104 C90 72 76 34 50 6 Z" />
        </defs>

        {/* connecting vine */}
        <path
          d="M-20 780 C 120 700, 90 560, 220 480 C 340 410, 320 260, 460 160 C 520 118, 560 90, 640 40"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.28"
          strokeWidth="3"
        />

        {/* soft filled leaves for depth */}
        <use href="#auth-leaf" transform="translate(30,555) rotate(-20) scale(1.6)" fill="#ffffff" fillOpacity="0.08" />
        <use href="#auth-leaf" transform="translate(175,415) rotate(35) scale(1.1)" fill="#ffffff" fillOpacity="0.10" />
        <use href="#auth-leaf" transform="translate(335,295) rotate(-45) scale(1.4)" fill="#ffffff" fillOpacity="0.08" />
        <use href="#auth-leaf" transform="translate(465,145) rotate(15) scale(1.2)" fill="#ffffff" fillOpacity="0.12" />
        <use href="#auth-leaf" transform="translate(85,675) rotate(60) scale(0.9)" fill="#ffffff" fillOpacity="0.10" />

        {/* foreground line-art leaves */}
        <use href="#auth-leaf" transform="translate(150,535) rotate(-15) scale(1.3)" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2" />
        <use href="#auth-leaf" transform="translate(300,355) rotate(28) scale(1.6)" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" />
        <use href="#auth-leaf" transform="translate(430,185) rotate(-30) scale(1.2)" fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="2" />
      </svg>

      {/* scrim so the overlay text stays legible over the line art behind it */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to top, ${BRAND.primaryHover} 0%, transparent 45%)`,
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1, color: '#fff', p: { md: 5, lg: 7 } }}>
        <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.5px', mb: 1.5 }}>
          Biodiversity Tracker
        </Typography>
        <Typography sx={{ opacity: 0.92, maxWidth: 380, fontSize: 16, lineHeight: 1.6 }}>
          Helping EM Services monitor estate flora, fauna and biodiversity - one report at a time.
        </Typography>
      </Box>
    </Box>
  );
}
