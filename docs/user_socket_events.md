# User Socket Events Documentation

This document outlines the real-time events that the user (customer) mobile application should handle.

## Mandatory Connection
Upon connecting to the socket server, the user is automatically joined to a private room: `user:${userId}`. This room is used for all targeted notifications.

---

## **Listen (Events Received by Mobile App)**

### `booking:status_updated`
**Trigger**: When any status change occurs for a booking belonging to the user.
**Payload**:
```json
{
  "bookingId": "65f123...",
  "status": "driver_assigned",
  "note": "A driver is heading to your location"
}
```

### `driver:location:update`
**Trigger**: Real-time coordinates of the assigned driver. Only received after a successful `user:booking:subscribe`.
**Payload**:
```json
{
  "bookingId": "65f123...",
  "lat": 19.123456,
  "lng": 72.856789,
  "heading": 120.5,
  "lastUpdatedAt": "2024-03-31T22:00:00Z"
}
```

### `notification`
**Trigger**: Generic server-sent message or global alert.
**Payload**:
```json
{
  "type": "info", // info, warning, success
  "message": "Your KYC has been verified successfully!",
  "data": {} 
}
```

### `error`
**Trigger**: When an emitted action fails or validation errors occur.
**Payload**:
```json
{
  "message": "Invalid booking ID or unauthorized access"
}
```

---

## **Emit (Actions Sent by Mobile App)**

### `user:booking:subscribe`
**Purpose**: Start tracking a specific booking for real-time location and status updates.
**Payload**:
```json
{
  "bookingId": "65f123..."
}
```

### `user:booking:unsubscribe`
**Purpose**: Stop tracking a booking (usually when leaving the detail screen).
**Payload**:
```json
{
  "bookingId": "65f123..."
}
```

### `driver:location:get`
**Purpose**: Manually request the latest driver location for a booking.
**Payload**:
```json
{
  "bookingId": "65f123..."
}
**Callback/Response**: Coordinates or `{ "error": "..." }`
```
