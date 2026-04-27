const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const playerRoutes = require('./routes/playerRoutes');
const eventRoutes = require('./routes/eventRoutes');
const eventRequestRoutes = require('./routes/eventRequestRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const messagingRoutes = require('./routes/messagingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const cropDiagnosisRoutes = require('./routes/cropDiagnosisRoutes');
const satelliteRoutes = require('./routes/satelliteRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(
  cors({
    origin: env.corsOrigin,
    credentials: true,
  })
);
app.use(helmet());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/event-requests', eventRequestRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/conversations', messagingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/crop-diagnosis', cropDiagnosisRoutes);
app.use('/api/satellite', satelliteRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
