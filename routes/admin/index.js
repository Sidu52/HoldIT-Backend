import adminAuthRoutes from "./auth.routes.js";
import adminDashboardRoutes from "./dashboard.routes.js";
import adminUsersRoutes from "./users.routes.js";
import adminDriversRoutes from "./drivers.routes.js";
import adminStoresRoutes from "./stores.routes.js";
import adminBookingsRoutes from "./bookings.routes.js";
import adminAdminsRoutes from "./admins.routes.js";

const adminRoutes = (app) => {
    // Admin
    app.use("/api/v1/admin/auth", adminAuthRoutes);
    app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
    app.use("/api/v1/admin/users", adminUsersRoutes);
    app.use("/api/v1/admin/drivers", adminDriversRoutes);
    app.use("/api/v1/admin/stores", adminStoresRoutes);
    app.use("/api/v1/admin/bookings", adminBookingsRoutes);
    app.use("/api/v1/admin/admins", adminAdminsRoutes);

}

export default adminRoutes;
