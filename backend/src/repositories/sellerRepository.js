import { db } from "../config/firebase.js";

class SellerRepository {

  async findBySellerId(sellerId) {

    const snapshot = await db
      .collection("sellers")
      .where("sellerId", "==", sellerId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data(),
    };

  }

}

export default new SellerRepository();