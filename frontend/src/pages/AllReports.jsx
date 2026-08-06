import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip, Alert,
  Stack, TextField, MenuItem,
} from '@mui/material';
import http from '../http';
import { CATEGORY_LABELS, STATUS_COLORS, STATUS_OPTIONS, CATEGORIES } from '../constants';

export default function AllReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;

    http
      .get('/api/reports', { params })
      .then((res) => {
        setReports(res.data);
        setError('');
      })
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false));
  }, [statusFilter, categoryFilter]);

  return (
    <Box sx={{ maxWidth: 700, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>All Reports</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          select
          label="Status"
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Category"
          size="small"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {CATEGORIES.map((c) => (
            <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {loading && <Typography>Loading...</Typography>}
      {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && reports.length === 0 && (
        <Typography>No reports found</Typography>
      )}

      {!loading && !error && reports.map((report) => (
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
              <Typography variant="body2">By: {report.reporter?.name || 'Unknown'}</Typography>
              {report.block_number && (
                <Typography variant="body2">{report.block_number}</Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {new Date(report.createdAt).toLocaleString()}
              </Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
