const crypto = require('crypto');

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue }      = require('firebase-admin/firestore');

function getDb(){
  if(!getApps().length){
    initializeApp({
      credential: cert({
        projectId:   'excel-unlocked',
        clientEmail: 'firebase-adminsdk-fbsvc@excel-unlocked.iam.gserviceaccount.com',
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      })
    });
  }
  return getFirestore();
}

// ₹99 = 9900 paise
const PKG_PRICES = {
  professional: 9900,
  analyst:      9900,
  genius:       9900,
  specialist:   9900,
};

const RAZORPAY_SECRET = 'OwhfmucwgUxmLCTcha1SWEgR';  // ← paste your secret key here

module.exports = async function handler(req, res){
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    package: pkg,
    uid,
    amount,
  } = req.body;

  if(!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing payment fields' });
  if(!pkg || !PKG_PRICES[pkg])
    return res.status(400).json({ error: 'Invalid package' });
  if(!uid)
    return res.status(400).json({ error: 'User ID required' });

  // Verify Razorpay signature
  const body     = razorpay_order_id + '|' + razorpay_payment_id;
  const expected = crypto.createHmac('sha256', RAZORPAY_SECRET).update(body).digest('hex');

  if(expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment verification failed' });

  // Grant access in Firestore
  try{
    const db = getDb();
    await db.collection('exlUsers').doc(uid).set({
      packages: {
        [pkg]: {
          paymentId:  razorpay_payment_id,
          orderId:    razorpay_order_id,
          grantedAt:  FieldValue.serverTimestamp(),
          amount:     PKG_PRICES[pkg],
          method:     'razorpay',
        }
      }
    }, { merge: true });

    return res.status(200).json({ success: true, package: pkg });

  } catch(err){
    console.error('Firestore write failed:', err.message);
    return res.status(500).json({ error: 'Could not save access. Contact support.' });
  }
};
