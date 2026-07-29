import { Box, Stack, Typography, ToggleButton, ToggleButtonGroup } from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlinedIcon from '@mui/icons-material/SettingsBrightnessOutlined';
import { BRAND } from '../theme';
import { useThemeMode } from '../contexts/ThemeModeContext';

const CHOICES = [
  { value: 'light', label: 'Light', icon: LightModeOutlinedIcon },
  { value: 'dark', label: 'Dark', icon: DarkModeOutlinedIcon },
  { value: 'system', label: 'System', icon: SettingsBrightnessOutlinedIcon },
];

/**
 * Colour-scheme picker. Shared by Settings and Profile so the two can never drift
 * apart - appearance is a per-person preference stored in this browser, which the
 * helper text says explicitly rather than leaving the user to guess whether it is
 * an account-wide or estate-wide change.
 */
export default function AppearanceSetting() {
  const { mode, resolvedMode, setMode } = useThemeMode();

  return (
    <Box>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_e, v) => v && setMode(v)}
        aria-label="Colour scheme"
        sx={{
          bgcolor: BRAND.section,
          borderRadius: '999px',
          p: '3px',
          gap: '2px',
          '& .MuiToggleButtonGroup-grouped': {
            border: 0, marginLeft: 0, px: 2, py: 0.6, borderRadius: '999px !important',
            textTransform: 'none', fontSize: 13.5, fontWeight: 600, color: BRAND.text, gap: 0.6,
            '&:hover': { bgcolor: 'rgba(120,130,145,0.14)' },
            '&.Mui-selected': { bgcolor: BRAND.slate, color: '#fff', '&:hover': { bgcolor: BRAND.slateHover } },
          },
        }}
      >
        {CHOICES.map(c => (
          <ToggleButton key={c.value} value={c.value}>
            <c.icon sx={{ fontSize: 17 }} />
            {c.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Stack direction="row" spacing={0.5} sx={{ mt: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
          Saved in this browser only - it does not change the theme for other users.
        </Typography>
        {mode === 'system' && (
          <Typography sx={{ fontSize: 12.5, color: BRAND.textLight }}>
            Currently following your device: <b>{resolvedMode}</b>.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
