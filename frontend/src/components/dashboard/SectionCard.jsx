import { Card, CardContent, Typography } from '@mui/material';
import { BRAND } from '../../theme';

/**
 * Card with a titled header + optional subtitle. Used for the dashboard's
 * chart and table panels so their framing stays consistent.
 */
export default function SectionCard({ title, subtitle, headingId, children, sx }) {
  return (
    <Card sx={{ height: '100%', ...sx }}>
      <CardContent sx={{ p: 3 }}>
        <Typography id={headingId} component="h2" variant="h6" fontWeight={700} sx={{ color: BRAND.heading, mb: subtitle ? 0.5 : 2 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 3 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
