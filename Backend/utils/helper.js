// order validation helper function
export const validateOrder = (data) => {
  if (!data.customerName?.trim() || typeof data.customerName !== "string") {
    return {
      valid: false,
      message: "Customer name is required and must be a non-empty string.",
    };
  }
  if (!data.customerPhone?.trim() || typeof data.customerPhone !== "string") {
    return {
      valid: false,
      message: "Customer phone is required and must be a non-empty string.",
    };
  }
  if (
    !data.customerAddress?.trim() ||
    typeof data.customerAddress !== "string"
  ) {
    return {
      valid: false,
      message: "Customer address is required and must be a non-empty string.",
    };
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { valid: false, message: "At least one order item is required." };
  }

  return { valid: true, message: "Order is valid." };
};

// order id generation
export const generateOrderId = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const randomNum = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `ORD-${year}${month}${day}${seconds}-${randomNum}`;
};

// calculate order total
export const calculateTotal = (items) => {
  const subTotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const tax = subTotal * 0.1; // 10% tax
  const deliveryFee = 50; // flat delivery fee
  const total = subTotal + tax + deliveryFee;
  return {
    subTotal: Math.round(subTotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    deliveryFee,
    total: Math.round(total * 100) / 100,
  };
};

//order document structure
export const createOrderDocument = (orderData, orderId, totals) => {
  return {
    orderId,
    customerName: orderData.customerName.trim(),
    customerPhone: orderData.customerPhone.trim(),
    customerAddress: orderData.customerAddress.trim(),
    items: orderData.items,
    tax: calculateTotal(orderData.items).tax,
    subTotal: calculateTotal(orderData.items).subTotal,
    deliveryFee: calculateTotal(orderData.items).deliveryFee,
    totalAmount: calculateTotal(orderData.items).total,
    specialNotes: orderData.specialNotes?.trim() || "",
    paymentMethod: orderData.paymentMethod || "Cash on Delivery",
    paymentStatus: "pending",
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        timestamp: new Date(),
        by: "Customer",
        note: "Order placed, waiting for confirmation",
      },
    ],
    estimatedTime: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const isValidStatusTransition = (currentStatus, newStatus) => {
    const validTransitions = {
        'pending': ["confirmed", "cancelled"],
        'confirmed': ["preparing", "cancelled"],
        'preparing': ["ready", "cancelled"],
        'ready': ["out_for_delivery", "cancelled"],
        'out_for_delivery': ["delivered", "cancelled"],
        'delivered': [],
        'cancelled': []
    }
    return validTransitions[currentStatus]?.includes(newStatus) || false;
}