import adminAuthRoutes from "./auth.routes.js";
import adminDashboardRoutes from "./dashboard.routes.js";
import adminUsersRoutes from "./users.routes.js";
import adminDriversRoutes from "./drivers.routes.js";
import adminStoresRoutes from "./stores.routes.js";
import adminBookingsRoutes from "./bookings.routes.js";
import adminAdminsRoutes from "./admins.routes.js";
import storeOwnerRoutes from "./storeowner.routes.js";

const adminRoutes = (app) => {
    // Admin
    app.use("/api/v1/admin/auth", adminAuthRoutes);
    app.use("/api/v1/admin/dashboard", adminDashboardRoutes);
    app.use("/api/v1/admin/user", adminUsersRoutes);
    app.use("/api/v1/admin/driver", adminDriversRoutes);
    app.use("/api/v1/admin/stores", adminStoresRoutes);
    app.use("/api/v1/admin/booking", adminBookingsRoutes);
    app.use("/api/v1/admin", adminAdminsRoutes);
    app.use("/api/v1/admin/storeowner", storeOwnerRoutes);

}

export default adminRoutes;
