import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import { CHART } from '../theme';

// Purely cosmetic: map a plant_family string to an MUI outlined icon.
// Keyed on lowercase family name - add new families here as they appear.
const FAMILY_ICONS = {
  // Palms and large trees
  arecaceae: ParkOutlinedIcon,
  fabaceae: ParkOutlinedIcon,
  myrtaceae: ParkOutlinedIcon,
  combretaceae: ParkOutlinedIcon,
  lauraceae: ParkOutlinedIcon,
  anacardiaceae: ParkOutlinedIcon,
  sapindaceae: ParkOutlinedIcon,
  bignoniaceae: ParkOutlinedIcon,
  // Flowering shrubs and ornamentals
  apocynaceae: LocalFloristOutlinedIcon,
  nyctaginaceae: LocalFloristOutlinedIcon,
  rubiaceae: LocalFloristOutlinedIcon,
  verbenaceae: LocalFloristOutlinedIcon,
  heliconiaceae: LocalFloristOutlinedIcon,
  strelitziaceae: LocalFloristOutlinedIcon,
  gentianaceae: LocalFloristOutlinedIcon,
  asteraceae: LocalFloristOutlinedIcon,
  malvaceae: LocalFloristOutlinedIcon,
  // Grasses and grass-like foliage
  poaceae: GrassOutlinedIcon,
  asparagaceae: GrassOutlinedIcon,
};

// Accent colour per icon group, drawn from the shared categorical palette in
// theme.js (single source of truth). Semantic success/warning/error hues are
// deliberately avoided - those are reserved for health status (see the locked
// rule in theme.js), so an icon colour is never confused with a health state.
const ICON_COLORS = new Map([
  [ParkOutlinedIcon, CHART.categorical[2]],         // teal - palms and trees
  [LocalFloristOutlinedIcon, CHART.categorical[3]], // magenta - flowering
  [GrassOutlinedIcon, CHART.categorical[1]],        // purple - grasses
  [SpaOutlinedIcon, 'text.secondary'],              // neutral fallback
]);

// Returns { Icon, color } for a plant family, falling back to a generic
// leaf icon in a neutral tone for unmapped or missing families.
export function getPlantIcon(plant_family) {
  const Icon = FAMILY_ICONS[(plant_family || '').trim().toLowerCase()] || SpaOutlinedIcon;
  return { Icon, color: ICON_COLORS.get(Icon) };
}
