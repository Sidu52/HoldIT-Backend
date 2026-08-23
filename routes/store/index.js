import storeRoute from "./store.route.js";
import storeAuthRoute from "./store.auth.route.js";
import storeBookingRoute from "./store.booking.route.js";
import storeSupportRoute from "./support.store.routes.js";

const DriverRoutes = (app) => {
    app.use("/api/v1/store/auth", storeAuthRoute);
    app.use("/api/v1/store", storeRoute);
    app.use("/api/v1/store/bookings", storeBookingRoute);
    app.use("/api/v1/store/support", storeSupportRoute);
}

export default DriverRoutes;
