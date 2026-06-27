import { useState, useEffect } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Card, CardActionArea, CardContent, Chip, Alert } from '@mui/material';
import http from '../http';
import { CATEGORY_LABELS, STATUS_COLORS } from '../constants';

export default function MyReports() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    http
      .get('/api/reports')
      .then((res) => setReports(res.data))
      .catch(() => setError('Failed to load reports'));
  }, []);

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">My Reports</Typography>
        <Button component={RouterLink} to="/submit-report" variant="contained">
          Submit Report
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!error && reports.length === 0 ? (
        <Typography>
          No reports yet.{' '}
          <Button component={RouterLink} to="/submit-report">Submit your first report</Button>
        </Typography>
      ) : (
        reports.map((report) => (
          <Card key={report.id} sx={{ mb: 2 }}>
            <CardActionArea onClick={() => navigate(`/reports/${report.id}`)}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="h6">{report.title}</Typography>
                  <Chip
                    label={report.status}
                    color={STATUS_COLORS[report.status] || 'default'}
                    size="small"
                  />
                </Box>
                <Typography color="text.secondary">
                  {CATEGORY_LABELS[report.category] || report.category}
                </Typography>
                {report.block_number && (
                  <Typography variant="body2">Block: {report.block_number}</Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  {new Date(report.createdAt).toLocaleString()}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))
      )}
    </Box>
  );
}
