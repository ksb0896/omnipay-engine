const { v4: uuidv4 } = require("uuid");

async function createPayment(payload) {
    console.log("Received payment request:", payload);

    if (!payload.clientId || !payload.amount) {
        throw new Error("clientId and amount are required");
    }

    const transactionId = uuidv4();

    return {
        transactionId,
        status: "PENDING"
    };
}

(async () => {
    const payload = { clientId: "merchant-1", amount: 500 };
    const result = await createPayment(payload);
    console.log("Payment Created:", result);
})();
