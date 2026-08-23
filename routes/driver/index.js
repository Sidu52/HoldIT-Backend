import driverRoute from "./driver.route.js";
import driverAuthRoute from "./auth.driver.js";
import driverRideRoute from "./driver.ride.route.js";
import driverSupportRoute from "./support.driver.routes.js";

const DriverRoutes = (app) => {
    app.use("/api/v1/driver/auth", driverAuthRoute);
    app.use("/api/v1/driver", driverRoute);
    app.use("/api/v1/driver/rides", driverRideRoute);
    app.use("/api/v1/driver/support", driverSupportRoute);
}

export default DriverRoutes;
