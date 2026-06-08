Booking flow overview

This document explains the end-to-end booking flow and socket events in this project, summarizes the fixes applied, and gives quick verification steps.

1) High-level booking lifecycle

- schedulePickup (user) -> booking created in DB with status `STORE_ASSIGNED`.
  - Post-commit: server emits `booking:created` to user & admin, `booking:store_assigned` to user & store, and `store:booking:incoming` to store room.
  - A driver-search job (`driver-assign` queue) is enqueued.

- Worker `driverSearchJob` runs and:
  - emits `booking:driver_searching` to user & admin when search begins.
  - iteratively creates offers via Redis and emits `driver:new_offer` to candidate drivers.
  - if all drivers exhausted, auto-cancels the booking and emits `booking:cancelled` / `booking:no_driver_available`.

- Driver accepts offer -> `processRideAccept`:
  - Moves booking to `DRIVER_ASSIGNED` (or `RETURN_DRIVER_ASSIGNED` for returns), sets assignment data and OTPs, marks driver as on-trip, and emits `booking:driver_assigned` to user & admin.

- Driver arrives at user -> `DRIVER_ARRIVED` event emitted; driver starts pickup -> driver confirms OTP -> booking transitions to `PICKED_UP` and `booking:picked_up` emitted.

- Driver arrives at store -> booking transitions to `AT_STORE` then store confirms `STORED` -> `booking:stored` emitted. Store capacity counters adjusted.

- Return flow: user requests return (`RETURN_REQUESTED`) -> enqueues return job, then driver assign/search similar to pickup, with `returnOtp` and `otp` fields used for store and user handovers respectively. Events mirror pickup lifecycle (`booking:return_requested`, `booking:return_driver_assigned`, `booking:out_for_return`, `booking:arrived_for_delivery`, `booking:delivered`).

2) Socket events (who receives what)

- User (room: `user:{userId}`): booking:created, booking:store_assigned, booking:driver_searching, booking:driver_assigned, booking:driver_arrived, booking:picked_up, booking:arrived_at_store, booking:stored, booking:return_requested, booking:return_driver_assigned, booking:out_for_return, booking:arrived_for_delivery, booking:delivered, booking:cancelled, booking:no_driver_available

- Store (room: `store:{storeId}`): store:booking:incoming, booking:store_assigned, booking:arrived_at_store, booking:out_for_return, booking:delivered, store:capacity:warning (future)

- Driver (room: `driver:{driverId}`): driver:new_offer, driver:location:updated, driver:booking:accepted/rejected

- Admin (room: `admin:dashboard`): admin booking + driver status events, driver search alerts

3) Fixes applied (summary)

- Replaced legacy `utils/cacheHelper.js` imports with `utils/cache.js` across multiple helper/controller files.
- Added missing constants and cache keys used by address and driver ride modules: `constants/user/address.js` (added `ADDRESS_LIMITS`, `CACHE_KEYS`, `CACHE_TTL`) and `constants/driver/driver.ride.js` (added `DRIVER_RIDE_CACHE`).
- Added/confirmed socket emitters and usages:
  - Added `emitStoreIncomingBooking` (store incoming notification) in `src/socket/emitters/booking.emitter.js`.
  - Emitted `booking:created`, `booking:store_assigned`, and `store:booking:incoming` after booking creation in `controllers/user/booking.user.controller.js`.
  - Emitted `booking:return_requested` when user requests return.
  - Emitted `booking:cancelled` on user-cancel and on auto-cancel (system) paths.
  - Enhanced driver cancel flow to properly `$unset` pickup assignment fields so the booking becomes eligible for a new driver search (fixes a stuck state).
- Fixed other import/constant mismatches causing runtime errors during startup.

Files modified (high level)
- controllers/user/booking.user.controller.js
- helpers/user/bookingHelper.js
- helpers/driver/driverRideHelper.js
- helpers/user/driverAssignHelper.js (minor fixes earlier)
- src/socket/emitters/booking.emitter.js
- constants/user/address.js
- constants/driver/driver.ride.js
- several other helper files to update imports to `utils/cache.js`

4) How to run and verify locally

Start the app (dev):

```bash
npm install
node app.js
```

Manual verification steps (recommended):
- Use the frontend or a socket test client to connect as:
  - a `user` (join `user:{userId}` room),
  - a `store` (join `store:{storeId}` room),
  - a `driver` (join `driver:{driverId}` room).

- Create a booking via the API (`POST /user/bookings` or the existing endpoint) and observe:
  - `booking:created` on user socket
  - `booking:store_assigned` on user & store sockets
  - `store:booking:incoming` on store socket

- Observe redis/worker logs for `driver:new_offer` messages; accept/reject via driver socket events to test driver assignment and pickup lifecycle.

- Test cancel and auto-cancel paths to verify `booking:cancelled` arrives.

5) Next recommended work

- Add an automated socket test client in `tools/socket-test-client.js` to simulate user/store/driver and exercise booking flows. I can add this now if you want.
- Add end-to-end integration tests for the booking and driver assignment flows.
- Run a full static code audit to remove duplicates and dead code and harden security/performance.

If you want, I will now add the socket test client and run an automated smoke test of the complete booking -> driver assignment -> pickup -> store -> return path.