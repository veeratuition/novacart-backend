import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../config/firebase.js';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function requireJwtSecret() {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured and at least 32 characters long.');
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').replace(/^91/, '').trim();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashRegistrationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signJwt({ uid, role, email, mobile, sellerId }) {
  requireJwtSecret();
  return jwt.sign(
    { uid, role, email, mobile, sellerId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

function publicUser(data) {
  return {
    uid: data.uid,
    sellerId: data.sellerId || data.uid,
    role: data.role || 'seller',
    email: data.email || '',
    mobile: data.mobile || '',
    name: data.name || data.fullName || '',
    shopName: data.shopName || '',
  };
}

class AuthController {
  async registerSellerApplication(req, res) {
    try {
      const body = req.body || {};
      const mobile = normalizePhone(body.mobile);
      const email = normalizeEmail(body.email);

      if (!/^\d{10}$/.test(mobile)) {
        return res.status(400).json({ success: false, message: 'Valid 10-digit mobile number is required.' });
      }
      if (!String(body.fullName || '').trim() || !String(body.shopName || '').trim()) {
        return res.status(400).json({ success: false, message: 'Seller name and shop name are required.' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      }

      const existing = await db.collection('seller_applications')
        .where('mobile', '==', mobile)
        .limit(5)
        .get();

      const activeExisting = existing.docs.find((doc) => {
        const status = String(doc.data()?.status || '').toLowerCase();
        return ['pending', 'approved', 'active'].includes(status);
      });

      if (activeExisting) {
        return res.status(409).json({
          success: false,
          message: 'A seller application already exists for this mobile number.',
        });
      }

      const applicationId = crypto.randomUUID();
      const registrationToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashRegistrationToken(registrationToken);

      const application = {
        applicationId,
        sellerId: applicationId,
        uid: applicationId,
        userId: applicationId,
        mobile,
        mobileVerified: true,
        fullName: String(body.fullName || '').trim(),
        email,
        dob: String(body.dob || '').trim(),
        shopName: String(body.shopName || '').trim(),
        businessName: String(body.businessName || '').trim(),
        businessType: String(body.businessType || '').trim(),
        gstNumber: String(body.gstNumber || '').trim().toUpperCase(),
        panNumber: String(body.panNumber || '').trim().toUpperCase(),
        doorNo: String(body.doorNo || '').trim(),
        street: String(body.street || '').trim(),
        area: String(body.area || '').trim(),
        city: String(body.city || '').trim(),
        mandal: String(body.mandal || '').trim(),
        district: String(body.district || '').trim(),
        state: String(body.state || '').trim(),
        pincode: String(body.pincode || '').trim(),
        latitude: body.latitude == null ? null : Number(body.latitude),
        longitude: body.longitude == null ? null : Number(body.longitude),
        accountHolderName: String(body.accountHolderName || '').trim(),
        bankName: String(body.bankName || '').trim(),
        accountNumber: String(body.accountNumber || '').trim(),
        ifscCode: String(body.ifscCode || '').trim().toUpperCase(),
        branchName: String(body.branchName || '').trim(),
        upiId: String(body.upiId || '').trim(),
        status: 'pending',
        currentStep: 5,
        registrationTokenHash: tokenHash,
        createdAt: new Date(),
        updatedAt: new Date(),
        submittedAt: new Date(),
      };

      await db.collection('seller_applications').doc(applicationId).set(application);

      return res.status(201).json({
        success: true,
        applicationId,
        registrationToken,
        status: 'pending',
      });
    } catch (error) {
      console.error('registerSellerApplication:', error);
      return res.status(500).json({ success: false, message: error.message || 'Unable to submit seller application.' });
    }
  }

  async sellerStatus(req, res) {
    try {
      const applicationId = String(req.body?.applicationId || '').trim();
      const registrationToken = String(req.body?.registrationToken || '').trim();
      if (!applicationId || !registrationToken) {
        return res.status(400).json({ success: false, message: 'Application credentials are required.' });
      }

      const snap = await db.collection('seller_applications').doc(applicationId).get();
      if (!snap.exists) return res.status(404).json({ success: false, message: 'Seller application not found.' });

      const data = snap.data() || {};
      if (data.registrationTokenHash !== hashRegistrationToken(registrationToken)) {
        return res.status(401).json({ success: false, message: 'Invalid application credentials.' });
      }

      return res.json({
        success: true,
        status: String(data.status || 'pending').toLowerCase(),
        applicationId,
        email: data.email || '',
        fullName: data.fullName || '',
        shopName: data.shopName || '',
        rejectReason: data.rejectReason || '',
        data: {
          status: data.status || 'pending',
          email: data.email || '',
          fullName: data.fullName || '',
          shopName: data.shopName || '',
          rejectReason: data.rejectReason || '',
        },
      });
    } catch (error) {
      console.error('sellerStatus:', error);
      return res.status(500).json({ success: false, message: 'Unable to check application status.' });
    }
  }

  async createSellerAccount(req, res) {
    try {
      const applicationId = String(req.body?.applicationId || '').trim();
      const registrationToken = String(req.body?.registrationToken || '').trim();
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');

      if (!applicationId || !registrationToken) {
        return res.status(400).json({ success: false, message: 'Application credentials are required.' });
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: 'Enter a valid seller email.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
      }

      const ref = db.collection('seller_applications').doc(applicationId);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ success: false, message: 'Seller application not found.' });

      const application = snap.data() || {};
      if (application.registrationTokenHash !== hashRegistrationToken(registrationToken)) {
        return res.status(401).json({ success: false, message: 'Invalid application credentials.' });
      }

      const status = String(application.status || '').toLowerCase();
      if (status !== 'approved') {
        return res.status(403).json({ success: false, message: 'Seller application is not approved yet.' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      let firebaseUser;

      try {
        firebaseUser = await getAuth().getUser(applicationId);
        firebaseUser = await getAuth().updateUser(applicationId, {
          email,
          password,
          displayName: application.fullName || application.shopName || 'NovaCart Seller',
          disabled: false,
        });
      } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
        firebaseUser = await getAuth().createUser({
          uid: applicationId,
          email,
          password,
          displayName: application.fullName || application.shopName || 'NovaCart Seller',
          disabled: false,
        });
      }

      const sellerData = {
        ...application,
        uid: firebaseUser.uid,
        sellerId: firebaseUser.uid,
        email,
        role: 'seller',
        status: 'approved',
        isActive: true,
        accountStatus: 'active',
        approved: true,
        passwordHash,
        accountCreated: true,
        accountCreatedAt: new Date(),
        updatedAt: new Date(),
      };
      delete sellerData.registrationTokenHash;

      await db.collection('sellers').doc(firebaseUser.uid).set(sellerData, { merge: true });
      await db.collection('users').doc(firebaseUser.uid).set({
        uid: firebaseUser.uid,
        role: 'seller',
        sellerUid: firebaseUser.uid,
        name: application.fullName || '',
        email,
        phone: application.mobile || '',
        status: 'approved',
        isActive: true,
        updatedAt: new Date(),
      }, { merge: true });

      await ref.set({
        ...application,
        uid: firebaseUser.uid,
        sellerId: firebaseUser.uid,
        email,
        accountCreated: true,
        accountCreatedAt: new Date(),
        status: 'approved',
        updatedAt: new Date(),
      }, { merge: true });

      const token = signJwt({
        uid: firebaseUser.uid,
        sellerId: firebaseUser.uid,
        role: 'seller',
        email,
        mobile: application.mobile || '',
      });
      const customToken = await getAuth().createCustomToken(firebaseUser.uid, {
        role: 'seller',
        sellerId: firebaseUser.uid,
      });

      return res.status(201).json({
        success: true,
        message: 'Seller account created successfully.',
        token,
        customToken,
        user: publicUser({ ...application, uid: firebaseUser.uid, email, role: 'seller' }),
      });
    } catch (error) {
      console.error('createSellerAccount:', error);
      const message = error.code === 'auth/email-already-exists'
        ? 'This email is already registered.'
        : error.message || 'Unable to create seller account.';
      return res.status(500).json({ success: false, message });
    }
  }

  async sellerLogin(req, res) {
    try {
      const mobile = normalizePhone(req.body?.mobile);
      const password = String(req.body?.password || '');
      if (!/^\d{10}$/.test(mobile) || !password) {
        return res.status(400).json({ success: false, message: 'Mobile number and password are required.' });
      }

      const snap = await db.collection('sellers').where('mobile', '==', mobile).limit(1).get();
      if (snap.empty) return res.status(401).json({ success: false, message: 'Invalid mobile number or password.' });

      const seller = snap.docs[0].data() || {};
      const uid = seller.uid || snap.docs[0].id;
      if (seller.isActive !== true || String(seller.status || '').toLowerCase() !== 'approved') {
        return res.status(403).json({ success: false, message: 'Seller account is not active or approved.' });
      }
      if (!seller.passwordHash) {
        return res.status(409).json({ success: false, message: 'Please create your seller account password first.' });
      }

      const valid = await bcrypt.compare(password, seller.passwordHash);
      if (!valid) return res.status(401).json({ success: false, message: 'Invalid mobile number or password.' });

      const token = signJwt({
        uid,
        sellerId: uid,
        role: 'seller',
        email: seller.email || '',
        mobile,
      });
      const customToken = await getAuth().createCustomToken(uid, {
        role: 'seller',
        sellerId: uid,
      });

      return res.json({
        success: true,
        token,
        customToken,
        user: publicUser({ ...seller, uid, mobile }),
      });
    } catch (error) {
      console.error('sellerLogin:', error);
      return res.status(500).json({ success: false, message: error.message || 'Unable to login.' });
    }
  }
}

export default new AuthController();
