/**
 * Shared case-category presentation: one glyph and one swatch per category.
 *
 * Its own module for the same reason rodentMapTokens.js is: two surfaces render the case
 * mix - the Cases by Category panel and the Recent Activity list - and a category that
 * looks different between them is a category the reader has to re-learn on every card.
 * The icon map already existed inside RecentActivity.jsx; CategoryBar was about to grow a
 * second copy, which is exactly how the two would have drifted.
 *
 * Not in constants.js despite CATEGORY_LABELS living there: that module is plain data
 * imported all over the app, and pulling MUI icon components into it would drag React
 * components into every consumer of a label lookup.
 */
import PetsOutlinedIcon from '@mui/icons-material/PetsOutlined';
import FlutterDashOutlinedIcon from '@mui/icons-material/FlutterDashOutlined';
import LocalFloristOutlinedIcon from '@mui/icons-material/LocalFloristOutlined';
import PestControlRodentOutlinedIcon from '@mui/icons-material/PestControlRodentOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';

export const CATEGORY_ICONS = {
  community_cat: PetsOutlinedIcon,
  pigeon: FlutterDashOutlinedIcon,
  flora_health: LocalFloristOutlinedIcon,
  pest: PestControlRodentOutlinedIcon,
  other: HelpOutlineRoundedIcon,
};

/**
 * Look the icon up as an INDEXED EXPRESSION at the point of use -
 * `CATEGORY_ICONS[c] || CATEGORY_ICONS.other` - not through a helper.
 *
 * There was an `iconFor(category)` wrapper here and it tripped react-compiler's
 * "Cannot create components during render": a function call returning a component cannot be
 * proven stable across renders, so the compiler has to assume a fresh component type each
 * time, which would reset the icon's state on every render. A property access off a module
 * constant is statically known to be the same type, so the same lookup written inline is
 * fine. Hence the map is exported and there is no helper.
 */

/**
 * ONE HUE, FIVE STEPS - the case-mix swatches are no longer four different colours.
 *
 * They were cyan, purple, teal and magenta off the NEON palette. Each was non-semantic by
 * design (a category swatch must not borrow a status hue, or a legend dot and a danger pill
 * end up the same colour meaning different things) but the result was four hues that appear
 * nowhere else in the product, on a page that also carries semantic red, amber and green.
 * That is most of why the dashboard read as having no palette.
 *
 * A single-hue ramp works here now for one reason: the list carries a per-category GLYPH.
 * Identity was resting entirely on colour, which is what forced four distinguishable hues;
 * once a pest row has a rodent icon and a flora row has a flower, the colour only has to
 * separate adjacent bar segments, and one hue at five weights does that.
 *
 * INDEXED BY THIS FIXED ORDER, NOT BY RANK. That distinction is the whole reason a ramp is
 * safe here. The list is sorted by count, so assigning shades by row position would change
 * a category's colour whenever the counts reordered - the exact defect that made the
 * original monochromatic scale unusable and sent it to NEON in the first place. Keyed off
 * the category name, each one owns its step permanently.
 *
 * Ordered by operational weight rather than alphabetically, so the darkest step lands on
 * pest - the category most likely to escalate - whenever it is present.
 */
const CATEGORY_ORDER = ['pest', 'community_cat', 'pigeon', 'flora_health', 'other'];

// Deepest first. Light: the action-blue family stepping down to slate. Dark: lifted, since
// a #1D4ED8-dark step is indistinguishable from the charcoal card behind it.
const RAMP = {
  light: ['#1D4ED8', '#3B72E8', '#6E9AF0', '#9CBCF5', '#C3D6F7'],
  dark: ['#8FB8F5', '#6E9AF0', '#5580D8', '#3F63AE', '#33507F'],
};

export const swatchFor = (category, mode = 'light') => {
  const ramp = RAMP[mode] || RAMP.light;
  const i = CATEGORY_ORDER.indexOf(category);
  // An unknown category takes the last step rather than wrapping into another
  // category's colour.
  return ramp[i === -1 ? ramp.length - 1 : i];
};
