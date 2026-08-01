import { Box, Container, Typography, Stack, Divider } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import LinkedInIcon from '@mui/icons-material/LinkedIn'
import YouTubeIcon from '@mui/icons-material/YouTube'
import { BRAND } from '../theme'
import EmServicesLogo from './EmServicesLogo'

/**
 * The site footer, moved out of App.jsx so pages that own their own scroll
 * region can render it at the end of that region.
 *
 * The full-height console pages (Notification Log, Alert Rules) fill the
 * viewport and scroll internally, so the document never scrolls and App.jsx's
 * own footer - which sits after the router outlet - would never be reachable.
 * They import this directly instead. Importing it from App.jsx would be a cycle.
 *
 * ================= CONTENT MATCHES emservices.com.sg =======================
 * Address, phone, enquiry routing, social links and the PDPA / Terms links are
 * taken from the live corporate footer, so an officer sees the same contact
 * details here as on the company site. Previously this said only "201 Kim Tian
 * Road, Singapore" - no unit, no postal code, no phone.
 *
 * The one deliberate divergence is the copyright line. The corporate site reads
 * "Copyright © EM Services Pte Ltd 2026 All Rights Reserved"; this build keeps
 * the "proof-of-concept" marker on the end, because presenting an internal
 * prototype as a finished EM Services property would misrepresent what it is.
 * ===========================================================================
 */

// Enquiry routing, as the corporate site splits it. Town council matters are
// deliberately NOT given an address there - they route to each TC's own site -
// so that line stays descriptive rather than inventing a mailbox.
const ENQUIRIES = [
  { label: 'General enquiries', email: 'feedback@emservices.com.sg' },
  { label: 'Property enquiries', email: 'info@emre.com.sg' },
]

// Hrefs read off the live emservices.com.sg footer and each checked for a 200.
// They are NOT reconstructed from the company name: an earlier guess at the
// YouTube handle ('@emservicespteltd', without the trailing digits) returned a
// 404. If these ever need updating, read them off the site again rather than
// inferring them.
const SOCIALS = [
  { label: 'EM Services on LinkedIn', href: 'https://sg.linkedin.com/company/em-services-pte-ltd/life?trk=nav_type_life', Icon: LinkedInIcon },
  { label: 'EM Services on YouTube', href: 'https://www.youtube.com/@emservicespteltd9516', Icon: YouTubeIcon },
]

// The corporate footer links these as root-relative paths (/pdpa/,
// /terms-conditions/); absolute here because this app is on its own origin.
const LEGAL = [
  { label: 'PDPA', href: 'https://www.emservices.com.sg/pdpa/' },
  { label: 'Terms & Conditions', href: 'https://www.emservices.com.sg/terms-conditions/' },
]

const COL_HEAD = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.5px',
  textTransform: 'uppercase', color: BRAND.textLight, mb: 1,
}

const LINK_SX = {
  fontSize: 13.5, color: BRAND.text, textDecoration: 'none',
  '&:hover': { color: BRAND.accent, textDecoration: 'underline' },
}

export default function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <Box component="footer" sx={{ mt: 6, borderTop: `1px solid ${BRAND.border}`, bgcolor: BRAND.surface }}>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1.6fr 1fr 1.2fr' }, gap: 3, rowGap: 4 }}>
          {/* identity */}
          <Box>
            {/* the company's own wordmark, which already reads "EM SERVICES" */}
            <Box sx={{ mb: 1.5 }}>
              <EmServicesLogo height={26} />
            </Box>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, maxWidth: 420, lineHeight: 1.5 }}>
              Township Management Partner for Better Communities. This 4E Flora, Fauna &amp; Estate
              Biodiversity Tracker is an internal proof-of-concept tool.
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1.5 }}>
              {SOCIALS.map(({ label, href, Icon }) => (
                <Box
                  key={label}
                  component="a"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  sx={{
                    width: 32, height: 32, borderRadius: '8px', display: 'grid', placeItems: 'center',
                    color: BRAND.textLight, border: `1px solid ${BRAND.border}`,
                    '&:hover': { color: BRAND.accent, borderColor: BRAND.accent },
                  }}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
              ))}
            </Stack>
          </Box>

          {/* the TOOL's own navigation, not the corporate site's marketing menu -
              this footer sits inside an operations app, so its quick links point
              at things an officer actually does */}
          <Box>
            <Typography sx={COL_HEAD}>Quick links</Typography>
            <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              {[
                { to: '/', label: 'Home' },
                { to: '/submit-report', label: 'Submit a report' },
                { to: '/reports', label: 'My reports' },
                { to: '/dashboard', label: 'Command Centre' },
              ].map(l => (
                <Box key={l.to} component={RouterLink} to={l.to} sx={LINK_SX}>
                  {l.label}
                </Box>
              ))}
            </Stack>
          </Box>

          {/* contact, matching the corporate footer */}
          <Box>
            <Typography sx={COL_HEAD}>Contact</Typography>
            <Typography sx={{ fontSize: 13.5, color: BRAND.text, lineHeight: 1.6 }}>
              201 Kim Tian Road #03-400
              <br />
              Singapore 160201
            </Typography>
            <Box component="a" href="tel:+6562788282" sx={{ ...LINK_SX, display: 'inline-block', mt: 0.75 }}>
              Tel: (65) 6278 8282
            </Box>

            <Stack spacing={0.25} sx={{ mt: 1.5 }}>
              {ENQUIRIES.map(e => (
                <Typography key={e.email} sx={{ fontSize: 12.5, color: BRAND.textLight, lineHeight: 1.6 }}>
                  {e.label}:{' '}
                  <Box component="a" href={`mailto:${e.email}`} sx={{ ...LINK_SX, fontSize: 12.5 }}>
                    {e.email}
                  </Box>
                </Typography>
              ))}
              {/* stated the way the corporate site states it - town council matters
                  go to each TC's own site, so no mailbox is invented here */}
              <Typography sx={{ fontSize: 12.5, color: BRAND.textLight, lineHeight: 1.6 }}>
                Town council matters: contact the respective Town Council.
              </Typography>
            </Stack>

            <Box
              component="a"
              href="https://www.emservices.com.sg"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ ...LINK_SX, color: BRAND.accent, display: 'inline-block', mt: 1.5 }}
            >
              emservices.com.sg
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2.5 }} />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={{ xs: 1, sm: 2 }}
          sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
        >
          {/* "proof-of-concept build" stays: an unqualified "All Rights Reserved"
              would present an internal prototype as a finished EM Services
              property. The product name itself is gone, as asked. */}
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
            Copyright © EM Services Pte Ltd {year} All Rights Reserved · proof-of-concept build
          </Typography>
          <Stack direction="row" spacing={2}>
            {LEGAL.map(l => (
              <Box key={l.href} component="a" href={l.href} target="_blank" rel="noopener noreferrer" sx={{ ...LINK_SX, fontSize: 12.5, color: BRAND.textLight }}>
                {l.label}
              </Box>
            ))}
          </Stack>
        </Stack>
      </Container>
    </Box>
  )
}
