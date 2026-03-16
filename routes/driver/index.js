import driverRoute from "./driver.route.js";
import driverAuthRoute from "./auth.driver.js";
import driverRideRoute from "./driver.ride.route.js";

const DriverRoutes = (app) => {
    app.use("/api/v1/driver/auth", driverAuthRoute);
    app.use("/api/v1/driver", driverRoute);
    app.use("/api/v1/driver", driverRideRoute);
}

export default DriverRoutes;
