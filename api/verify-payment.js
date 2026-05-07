// ═══════════════════════════════════════════════════════════════
//  api/verify-payment.js  —  Vercel Serverless Function
//  Verifies Razorpay payment signature and grants package access
//  in Firestore. Never trust the client to grant its own access.
// ═══════════════════════════════════════════════════════════════

const crypto = require('crypto');

// ── Firebase Admin SDK ──────────────────────────────────────────
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue }      = require('firebase-admin/firestore');

function getDb(){
  if(!getApps().length){
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel env vars can't store literal \n — replace \\n → \n
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
  }
  return getFirestore();
}

// ── Package prices (INR paise — 1 INR = 100 paise) ─────────────
const PKG_PRICES = {
  professional: 49900,   // ₹499
  analyst:      79900,   // ₹799
  genius:       99900,   // ₹999
  specialist:   99900,   // ₹999
};

const PKG_NAMES = {
  professional: 'Professional Package',
  analyst:      'Analyst Package',
  genius:       'Genius Package',
  specialist:   'Specialist Package',
};

// ── Main handler ────────────────────────────────────────────────
module.exports = async function handler(req, res){

  // CORS preflight
  if(req.method === 'OPTIONS'){
    return res.status(200).end();
  }

  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    package: pkg,
    uid,          // Firebase user UID — passed from client after auth
    amount,       // Amount in paise — we verify this server-side
  } = req.body;

  // ── 1. Validate inputs ──────────────────────────────────────
  if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature){
    return res.status(400).json({ error: 'Missing payment fields' });
  }
  if(!pkg || !PKG_PRICES[pkg]){
    return res.status(400).json({ error: 'Invalid package' });
  }
  if(!uid){
    return res.status(400).json({ error: 'User ID required' });
  }

  // ── 2. Verify Razorpay signature ────────────────────────────
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const body   = razorpay_order_id + '|' + razorpay_payment_id;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  if(expected !== razorpay_signature){
    console.error('Signature mismatch', { expected, razorpay_signature });
    return res.status(400).json({ error: 'Payment verification failed' });
  }

  // ── 3. Verify amount matches expected price ─────────────────
  // (Razorpay order amount is set server-side via their API,
  //  but we double-check the declared amount matches our price list)
  if(amount && parseInt(amount) !== PKG_PRICES[pkg]){
    console.error('Amount mismatch', { declared: amount, expected: PKG_PRICES[pkg] });
    return res.status(400).json({ error: 'Amount mismatch' });
  }

  // ── 4. Grant access in Firestore ────────────────────────────
  try{
    const db = getDb();
    await db.collection('exlUsers').doc(uid).set({
      packages: {
        [pkg]: {
          paymentId:  razorpay_payment_id,
          orderId:    razorpay_order_id,
          grantedAt:  FieldValue.serverTimestamp(),
          expiresAt:  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          method:     'razorpay',
        }
      },
      lastPayment: {
        paymentId: razorpay_payment_id,
        pkg,
        amount:    PKG_PRICES[pkg],
        timestamp: FieldValue.serverTimestamp(),
      }
    }, { merge: true });

    console.log(`✅ Access granted: uid=${uid} pkg=${pkg} payment=${razorpay_payment_id}`);
    return res.status(200).json({
      success: true,
      package: pkg,
      message: `${PKG_NAMES[pkg]} unlocked successfully`,
    });

  } catch(err){
    console.error('Firestore write failed:', err);
    return res.status(500).json({ error: 'Could not save access. Contact support.' });
  }
};
