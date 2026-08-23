import Payment from "./payment.routes.js";

const PaymentRoutes = (app) => {
    app.use("/api/v1/payments", Payment);
}

export default PaymentRoutes;
