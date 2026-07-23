require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { sequelize } = require('./models');

const { startCronJobs } = require('./cron');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Add it to backend/.env before starting.');
  process.exit(1);
}

const app = express();

// 10mb: rodent assessments can carry a base64 field photo in the JSON body
// (the express default of 100kb rejects any real photo before it reaches the route).
app.use(express.json({ limit: '10mb' }));
app.use(cors());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/flora', require('./routes/floraRoutes'));
app.use('/api/fauna', require('./routes/faunaRoutes'));

app.use('/api/alert-rules', require('./routes/alertRules'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/rodent-assessments', require('./routes/rodentAssessments'));
app.use('/api/work-orders', require('./routes/workOrders'));
app.use('/api/scorecard', require('./routes/scorecard'));
app.use('/api/block-diagnosis', require('./routes/blockDiagnosis'));
app.use('/api/rodent-riskmap', require('./routes/rodentRiskMap'));

// Global error handler - must stay last.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await sequelize.sync();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  startCronJobs();
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app;
