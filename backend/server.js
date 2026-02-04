import http from 'http';
import { Server } from 'socket.io';

import databaseConnection from './config/database.js';
import { config } from './config/environment.js';
import { createApp } from './app.js';
import PropertyType from './models/propertyType.model.js';

// In-memory online presence
const onlineUsers = new Set();

export const app = createApp();
export const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    credentials: config.cors.credentials,
  },
});

async function seedPropertyTypesIfEmpty() {
  try {
    const count = await PropertyType.countDocuments();
    if (count > 0) return;

    console.log('[seed] No property types found, seeding defaults...');
    const defaultTypes = [
      { name: 'House', slug: 'house', description: 'Independent house or villa', icon: '🏠', category: 'residential', isSystem: true, order: 1, fields: [
        { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: true, min: 1, max: 20, defaultValue: 1, order: 1, group: 'rooms' },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: true, min: 1, max: 20, defaultValue: 1, order: 2, group: 'rooms' },
        { key: 'floors', label: 'Number of Floors', type: 'number', required: false, min: 1, max: 10, defaultValue: 1, order: 3, group: 'structure' },
        { key: 'areaSqFt', label: 'Built-up Area', type: 'number', required: false, min: 0, unit: 'sq.ft', order: 4, group: 'dimensions' },
        { key: 'plotSize', label: 'Plot Size', type: 'text', required: false, placeholder: 'e.g., 200 sq.yd', order: 5, group: 'dimensions' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'garden', label: 'Garden', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
      ]},
      { name: 'Flat', slug: 'flat', description: 'Apartment or flat in a building', icon: '🏢', category: 'residential', isSystem: true, order: 2, fields: [
        { key: 'bedrooms', label: 'Bedrooms', type: 'number', required: true, min: 1, max: 10, defaultValue: 1, order: 1, group: 'rooms' },
        { key: 'bathrooms', label: 'Bathrooms', type: 'number', required: true, min: 1, max: 10, defaultValue: 1, order: 2, group: 'rooms' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 100, order: 3, group: 'location' },
        { key: 'totalFloors', label: 'Total Floors in Building', type: 'number', required: false, min: 1, max: 100, order: 4, group: 'location' },
        { key: 'areaSqFt', label: 'Carpet Area', type: 'number', required: false, min: 0, unit: 'sq.ft', order: 5, group: 'dimensions' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'lift', label: 'Lift Available', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
        { key: 'balcony', label: 'Balcony', type: 'boolean', required: false, defaultValue: false, order: 9, group: 'amenities' },
      ]},
      { name: 'Plot', slug: 'plot', description: 'Land or plot for construction', icon: '📐', category: 'land', isSystem: true, order: 3, fields: [
        { key: 'sqYard', label: 'Area in Sq. Yards', type: 'number', required: true, min: 0, unit: 'sq.yd', order: 1, group: 'dimensions' },
        { key: 'sqYardRate', label: 'Rate per Sq. Yard', type: 'number', required: false, min: 0, unit: '₹', order: 2, group: 'pricing' },
        { key: 'plotType', label: 'Plot Type', type: 'select', required: false, options: ['Residential', 'Commercial', 'Agricultural', 'Industrial'], order: 3, group: 'details' },
        { key: 'facing', label: 'Facing Direction', type: 'select', required: false, options: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'], order: 4, group: 'details' },
        { key: 'boundaryWall', label: 'Boundary Wall', type: 'boolean', required: false, defaultValue: false, order: 5, group: 'features' },
        { key: 'cornerPlot', label: 'Corner Plot', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'features' },
        { key: 'gatedCommunity', label: 'Gated Community', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'features' },
      ]},
      { name: 'Factory', slug: 'factory', description: 'Industrial factory or manufacturing unit', icon: '🏭', category: 'industrial', isSystem: true, order: 4, fields: [
        { key: 'areaSqFt', label: 'Built-up Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'plotSize', label: 'Total Plot Size', type: 'text', required: false, placeholder: 'e.g., 5000 sq.yd', order: 2, group: 'dimensions' },
        { key: 'powerLoad', label: 'Power Load', type: 'text', required: false, placeholder: 'e.g., 100 KW', order: 3, group: 'utilities' },
        { key: 'ceilingHeight', label: 'Ceiling Height', type: 'number', required: false, min: 0, unit: 'ft', order: 4, group: 'structure' },
        { key: 'dockingBays', label: 'Number of Docking Bays', type: 'number', required: false, min: 0, order: 5, group: 'facilities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'officeSpace', label: 'Office Space Included', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
      ]},
      { name: 'Shop', slug: 'shop', description: 'Commercial shop or retail space', icon: '🏪', category: 'commercial', isSystem: true, order: 5, fields: [
        { key: 'areaSqFt', label: 'Shop Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 50, order: 2, group: 'location' },
        { key: 'frontage', label: 'Frontage Width', type: 'number', required: false, min: 0, unit: 'ft', order: 3, group: 'dimensions' },
        { key: 'washroom', label: 'Washroom Available', type: 'boolean', required: false, defaultValue: false, order: 4, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 5, group: 'amenities' },
        { key: 'cornerShop', label: 'Corner Shop', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'features' },
        { key: 'mainRoadFacing', label: 'Main Road Facing', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'features' },
      ]},
      { name: 'Office', slug: 'office', description: 'Commercial office space', icon: '🏢', category: 'commercial', isSystem: true, order: 6, fields: [
        { key: 'areaSqFt', label: 'Office Area', type: 'number', required: true, min: 0, unit: 'sq.ft', order: 1, group: 'dimensions' },
        { key: 'cabins', label: 'Number of Cabins', type: 'number', required: false, min: 0, order: 2, group: 'layout' },
        { key: 'workstations', label: 'Number of Workstations', type: 'number', required: false, min: 0, order: 3, group: 'layout' },
        { key: 'meetingRooms', label: 'Meeting Rooms', type: 'number', required: false, min: 0, order: 4, group: 'layout' },
        { key: 'floor', label: 'Floor Number', type: 'number', required: false, min: 0, max: 100, order: 5, group: 'location' },
        { key: 'furnished', label: 'Furnished', type: 'boolean', required: false, defaultValue: false, order: 6, group: 'amenities' },
        { key: 'parking', label: 'Parking Available', type: 'boolean', required: false, defaultValue: false, order: 7, group: 'amenities' },
        { key: 'lift', label: 'Lift Available', type: 'boolean', required: false, defaultValue: false, order: 8, group: 'amenities' },
        { key: 'cafeteria', label: 'Cafeteria', type: 'boolean', required: false, defaultValue: false, order: 9, group: 'amenities' },
      ]},
    ];

    await PropertyType.insertMany(defaultTypes);
    console.log(`[seed] Seeded ${defaultTypes.length} default property types`);
  } catch (error) {
    console.error('[seed] Failed to seed property types:', error.message);
  }
}

export async function startServer() {
  await databaseConnection.connect();
  await seedPropertyTypesIfEmpty();

  return new Promise((resolve, reject) => {
    server.listen(config.server.port, config.server.host, () => {
      resolve();
    });

    server.on('error', (err) => reject(err));
  });
}

export function setupSocket() {
  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (userId) {
      socket.join(`user:${userId}`);
      onlineUsers.add(String(userId));
      io.emit('presence:update', { userId: String(userId), online: true });
      try {
        socket.emit('presence:bulk', Array.from(onlineUsers));
      } catch (_) {}
    }

    socket.on('typing', (payload) => {
      const { to } = payload || {};
      if (to) io.to(`user:${to}`).emit('typing', { from: userId });
    });

    socket.on('stop_typing', (payload) => {
      const { to } = payload || {};
      if (to) io.to(`user:${to}`).emit('stop_typing', { from: userId });
    });

    socket.on('disconnect', () => {
      if (userId) {
        onlineUsers.delete(String(userId));
        io.emit('presence:update', { userId: String(userId), online: false });
      }
    });
  });
}

export async function stopServer() {
  try {
    await databaseConnection.disconnect();
  } catch (_) {}

  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
