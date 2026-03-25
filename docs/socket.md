# Socket.io Client Connection Guide

This document outlines how frontend applications (User, Driver, Admin, Store interfaces) should connect to the centralized Socket.io server to receive real-time location and booking updates.

## 1. Connection & Authentication
The socket server uses JWT authentication matching your standard REST API tokens.
A connection will be rejected with an `UNAUTHORIZED` `connect_error` if the token is missing or invalid.

```javascript
import { io } from "socket.io-client";

const socket = io('http://localhost:5000', {
  auth: { token: 'Bearer YOUR_JWT_TOKEN_HERE' },
  transports: ['websocket', 'polling'] // Recommended to allow fallback
});

socket.on('connect_error', (err) => {
  if (err.message === 'UNAUTHORIZED') {
      console.error("Token expired or invalid");
      redirectToLogin();
  }
});

socket.on('connect', () => {
    console.log("Connected to Real-Time Server", socket.id);
});
```

## 2. Driver Location Tracking (Live Map updates)

**For Users / Admins watching a booking:**
To receive live map updates for your assigned driver, you must specifically subscribe to a booking's tracking room.

```javascript
// Step A: Subscribe to the active booking
socket.emit('user:booking:subscribe', { bookingId: "651a2b3c4d5e..." });

// Step B: Listen for live coordinate drops (every ~30s)
socket.on('driver:location:updated', ({ lat, lng, heading, speed, updatedAt }) => {
  updateMapMarker(lat, lng, heading);
});

// Step C: (Optional) Unsubscribe when delivered or cancelled
socket.emit('user:booking:unsubscribe', { bookingId: "651a2b3c4d5e..." });
```

**For Drivers broadcasting their location:**
Drivers must periodically transmit their GPS payload. The server heavily rate-limits these to protect the cache, but pushing every 30 seconds is standard.

```javascript
if (userRole === 'driver' && hasActiveBooking) {
  setInterval(() => {
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      socket.emit('driver:location:update', {
        bookingId: activeBookingId,
        lat: coords.latitude,
        lng: coords.longitude,
        heading: coords.heading,
        speed: coords.speed,
        timestamp: Date.now()
      });
    });
  }, 30000); // 30 seconds
}
```

## 3. Booking Lifecycle Events
You do not need to "subscribe" to receive these. As long as you are connected with a valid token, the server automatically maps your User ID to a secure room, pushing relevant lifecycle shifts immediately.

```javascript
// Driver was matched and assigned
socket.on('booking:driver_assigned', ({ bookingId, driver }) => {
  showDriverProfileCard(driver.name, driver.phone, driver.vehicleNumber);
});

// Driver arrived at pickup
socket.on('booking:driver_arrived', ({ bookingId, arrivedAt }) => {
  showOtpInputScreen();
});

// Luggage handed back to User
socket.on('booking:delivered', ({ bookingId, deliveredAt, driver }) => {
  showSuccessToast(`Luggage successfully delivered by ${driver.name}`);
});

// The system failed to find an available driver
socket.on('booking:no_driver_available', ({ message }) => {
  showErrorOverlay(message);
});
```

## 4. Admin Live Dashboard Events
If connected as a `SUPER_ADMIN` or `OPERATION_MANAGER`, the socket automatically bridges you into the `admin:dashboard` room.

```javascript
// Global Driver Fleet Statuses
socket.on('admin:driver:status_changed', ({ driverId, name, is_online, is_on_trip }) => {
  updateFleetTable(driverId, { is_online, is_on_trip });
});

// Stale Location Alerts
socket.on('driver:location:stale', ({ driverId, bookingId, lastSeen }) => {
  triggerAdminAlert(`Driver ${driverId} has not updated location in 5 minutes!`);
});

// High-Level Data Aggregation (Emitted every 60s when an admin is connected)
socket.on('admin:stats:update', ({ activeBookings, onlineDrivers, pendingBookings, completedToday }) => {
  updateDashboardChart(activeBookings, onlineDrivers, pendingBookings, completedToday);
});
```
