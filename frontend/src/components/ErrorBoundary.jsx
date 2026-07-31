import { Component } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { BRAND } from '../theme';

// Contains a render crash to the current page instead of white-screening the
// whole app. Keyed by route in App, so navigating away clears the error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('UI error boundary caught:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', textAlign: 'center', py: 10, px: 3 }}>
        <ReportProblemOutlinedIcon sx={{ fontSize: 44, color: BRAND.accent, mb: 1.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 700, color: BRAND.heading, mb: 0.5 }}>
          Something went wrong on this page
        </Typography>
        <Typography variant="body2" sx={{ color: BRAND.textLight, mb: 3 }}>
          The rest of the app is unaffected. Try reloading this page, or head back to the dashboard.
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center' }}>
          <Button variant="contained" onClick={() => window.location.reload()}>Reload page</Button>
          <Button variant="outlined" onClick={() => window.location.assign('/')} sx={{ borderColor: BRAND.border, color: BRAND.text }}>
            Go home
          </Button>
        </Stack>
      </Box>
    );
  }
}
