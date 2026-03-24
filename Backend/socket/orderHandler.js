import { ReturnDocument } from "mongodb";
import { getCollection } from "../config/database.js";
import {
  calculateTotal,
  createOrderDocument,
  isValidStatusTransition,
} from "../utils/helper.js";

export const orderHandler = (io, socket) => {
  console.log(`📦 Order handler initialized for socket: ${socket.id}`);

  // emit --> tiger --> on/listener
  socket.on("placeOrder", async (data, callback) => {
    try {
      console.log(`📥 Received order from ${socket.id}:`, data);
      const validation = validateOrder(data);
      if (!validation.valid) {
        return callback({ success: false, message: validation.message });
      }
      const orderId = generateOrderId();
      const totals = calculateTotal(data.items);
      const order = createOrderDocument(data, orderId, totals);
      //   Save order to database
      const ordersCollection = getCollection("orders");
      await ordersCollection.insertOne(order);
      // Emit order confirmation back to client

      socket.join(`order-${orderId}`); // Join room with orderId
      socket.join("customers"); // Join general customers room

      io.to("admins").emit("newOrder", order); // Notify admins of new order
      callback({
        success: true,
        message: "Order placed successfully!",
        orderId,
      });

      console.log(` order placed successfully with ID: ${orderId}`);
    } catch (error) {
      console.error(
        `❌ Error occurred while handling order from ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to place order. Please try again.",
      });
    }
  });

  // order tracking
  socket.on("trackOrder", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data.orderId });
      if (!order) {
        return callback({ success: false, message: "Order not found." });
      }
      socket.join(`order-${data.orderId}`); // Join room for this order
      callback({ success: true, order });
    } catch (error) {
      console.error(
        `❌ Error occurred while tracking order for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to track order. Please try again.",
      });
    }
  });

  // cancel order
  socket.on("cancelOrder", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data.orderId });
      if (!order) {
        return callback({ success: false, message: "Order not found." });
      }
      if (!["pending", "confirmed"].includes(order.status)) {
        return callback({
          success: false,
          message: "Order cannot be cancelled at this stage.",
        });
      }
      await ordersCollection.updateOne(
        { orderId: data.orderId },
        {
          $set: { status: "cancelled", updatedAt: new Date() },
          $push: {
            statusHistory: {
              status: "cancelled",
              timestamp: new Date(),
              by: socket.id,
              note: data.reason || "Cancelled by customer",
            },
          },
        },
      );
      io.to(`order-${data.orderId}`).emit("orderCancelled", {
        orderId: data.orderId,
      });
      io.to("admins").emit("orderCancelled", {
        orderId: data.orderId,
        CustomerName: order.customerName,
      });
      callback({ status: true, message: "Order cancelled successfully." });
    } catch (error) {
      console.error(
        `❌ Error occurred while cancelling order for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to cancel order. Please try again.",
      });
    }
  });

  // get my orders
  socket.on("getMyOrders", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const orders = await ordersCollection
        .find({ customerPhone: data.customerPhone })
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray();
      callback({ success: true, orders });
    } catch (error) {
      console.error(
        `❌ Error occurred while fetching orders for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to fetch orders. Please try again.",
      });
    }
  });

  // Admin stage

  // admin Login
  socket.on("adminLogin", async (data, callback) => {
    try {
      if (data.password === process.env.ADMIN_PASSWORD) {
        socket.isAdmin = true;
        socket.join("admins");
        callback({ success: true, message: "Admin login successful." });
        console.log(`👑 Admin logged in: ${socket.id}`);
      } else {
        callback({ success: false, message: "Invalid admin credentials." });
      }
    } catch (error) {
      console.error(
        `❌ Error occurred while admin login for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to login as admin. Please try again.",
      });
    }
  });

  // update & get all order status
  socket.on("getAllOrders", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access." });
      }
      const ordersCollection = getCollection("orders");
      const filter = data.status ? { status: data.status } : {};
      const orders = await ordersCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();
      callback({ success: true, orders });
    } catch (error) {
      console.error(
        `❌ Error occurred while fetching all orders for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to fetch orders. Please try again.",
      });
    }
  });

  // update order status
  socket.on("updateOrderStatus", async (data, callback) => {
    try {
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data.orderId });
      if (!order) {
        return callback({ success: false, message: "Order not found." });
      }
      if (!isValidStatusTransition(order.status, data.newStatus)) {
        return callback({
          success: false,
          message: `Invalid status transition from ${order.status} to ${data.newStatus}.`,
        });
      }
      const result = await ordersCollection.findOneAndUpdate(
        { orderId: data.orderId },
        {
          $set: { status: data.newStatus, updatedAt: new Date() },
          $push: {
            statusHistory: {
              status: data.newStatus,
              timestamp: new Date(),
              by: socket.id,
              note: data.note || `Status updated to ${data.newStatus}`,
            },
          },
        },
        { ReturnDocument: "after" },
      );
      io.to(`order-${data.orderId}`).emit("statusUpdated", {
        orderId: data.orderId,
        status: data.newStatus,
        order: result,
      });
      socket.to("admins").emit("orderStatusChanged", {
        orderId: data.orderId,
        newStatus: data.newStatus,
      });
      callback({
        success: true,
        message: "Order status updated successfully.",
      });
    } catch (error) {
      callback({
        success: false,
        message: "Failed to update order status. Please try again.",
      });
    }
  });
  // accept order
  socket.on("acceptOrder", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access." });
      }
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data.orderId });
      if (!order || order.status !== "pending") {
        return callback({
          success: false,
          message: "Order not found or cannot be accepted.",
        });
      }
      const estimatedTime = data.estimatedTime || 30; // default to 30 mins
      const result = await ordersCollection.findOneAndUpdate(
        { orderId: data.orderId },
        {
          $set: {
            status: "confirmed",
            estimatedTime: estimatedTime,
            updatedAt: new Date(),
          },
          $push: {
            statusHistory: {
              status: "confirmed",
              timestamp: new Date(),
              by: socket.id,
              note: `Order accepted with estimated time of ${estimatedTime} mins`,
            },
          },
        },
        { ReturnDocument: "after" },
      );
      io.to(`order-${data.orderId}`).emit("orderAccepted", {
        orderId: data.orderId,
        estimatedTime,
      });
      socket.to("admins").emit("orderAcceptedByAdmin", {
        // to / on
        orderId: data.orderId,
      });
      callback({
        success: true,
        message: "Order accepted successfully.",
        order: result,
      });
    } catch (error) {
      callback({
        success: false,
        message: "Failed to accept order. Please try again.",
      });
    }
  });
  // reject order
  socket.on("rejectOrder", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access." });
      }
      const ordersCollection = getCollection("orders");
      const order = await ordersCollection.findOne({ orderId: data.orderId });
      if (!order || order.status !== "pending") {
        return callback({
          success: false,
          message: "Order not found or cannot be rejected.",
        });
      }
      const result = await ordersCollection.findOneAndUpdate(
        { orderId: data.orderId },
        {
          $set: {
            status: "cancelled",
            estimatedTime: estimatedTime,
            updatedAt: new Date(),
          },
          $push: {
            statusHistory: {
              status: "cancelled",
              timestamp: new Date(),
              by: socket.id,
              note: `Order rejected`,
            },
          },
        },
        { ReturnDocument: "after" },
      );
      io.to(`order-${data.orderId}`).emit("orderRejected", {
        orderId: data.orderId,
        reason: data.reason || "Order rejected by admin",
      });
      socket.to("admins").emit("orderRejectedByAdmin", {
        // on
        reason: data.reason || "Order rejected by admin",
      });
      callback({
        success: true,
        message: "Order rejected successfully.",
      });
    } catch (error) {
      console.error(
        `❌ Error occurred while rejecting order for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to reject order. Please try again.",
      });
    }
  });

  // live order updates
  socket.on("getLiveStats", async (data, callback) => {
    try {
      if (!socket.isAdmin) {
        return callback({ success: false, message: "Unauthorized access." });
      }
      const ordersCollection = getCollection("orders");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const stats = {
        totalToday: await ordersCollection.countDocuments({
          createdAt: { $gte: today },
        }),
        pending: await ordersCollection.countDocuments({
          status: "pending",
        }),
        preparing: await ordersCollection.countDocuments({
          status: "preparing",
        }),
        confirmed: await ordersCollection.countDocuments({
          status: "confirmed",
        }),
        ready: await ordersCollection.countDocuments({
          status: "ready",
        }),
        out_for_delivery: await ordersCollection.countDocuments({
          status: "out_for_delivery",
        }),
        delivered: await ordersCollection.countDocuments({
          status: "delivered",
        }),
        cancelled: await ordersCollection.countDocuments({
          status: "cancelled",
        }),
      };
      callback({ success: true, stats });
    } catch (error) {
      console.error(
        `❌ Error occurred while fetching live stats for ${socket.id}:`,
        error,
      );
      callback({
        success: false,
        message: "Failed to fetch live stats. Please try again.",
      });
    }
  });

  // disconnect handler
  socket.on("disconnected", () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
    if (socket.isAdmin) {
      socket.to("admins").emit("adminDisconnected", {
        adminId: socket.id,
        message: "An admin has disconnected.",
      });
    }
  });
};
