import { db } from "../config/firebase.js";

class OrderRepository {

  async findById(orderId) {

    const snapshot = await db
      .collection("orders")
      .doc(orderId)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };

  }

  async update(orderId, data) {

    await db
      .collection("orders")
      .doc(orderId)
      .update(data);

  }

}

export default new OrderRepository();