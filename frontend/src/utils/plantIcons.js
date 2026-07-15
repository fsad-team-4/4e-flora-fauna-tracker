import ParkOutlinedIcon from '@mui/icons-material/ParkOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import GrassOutlinedIcon from '@mui/icons-material/GrassOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';

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

// Returns the icon component for a plant family, falling back to a
// generic leaf icon for unmapped or missing families.
export function getPlantIcon(plant_family) {
  return FAMILY_ICONS[(plant_family || '').trim().toLowerCase()] || SpaOutlinedIcon;
}
