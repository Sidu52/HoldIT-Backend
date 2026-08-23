import userAuthRoute from "./auth.user.js";
import userRoute from "./user.user.js";
import bookingRoute from "./booking.user.js";
import storesRoute from "./store.user.routes.js";
import supportRoute from "./support.user.routes.js";
import reviewRoute from "./review.user.js";

const userRoutes = (app) => {
    app.use("/api/v1/user/auth", userAuthRoute);
    app.use("/api/v1/user", userRoute);
    app.use("/api/v1/user/booking", bookingRoute);
    app.use("/api/v1/user/stores", storesRoute);
    app.use("/api/v1/user/support", supportRoute);
    app.use("/api/v1/user/reviews", reviewRoute);
}

export default userRoutes;