import { db } from "../config/firebase.js";

class ProductRepository {

  async findById(productId) {

    const snapshot = await db
      .collection("products")
      .doc(productId)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    return {
      id: snapshot.id,
      ...snapshot.data(),
    };

  }

}

export default new ProductRepository();