// ═══════════════════════════════════════════════════════════════
//  api/create-order.js  —  Vercel Serverless Function
//  Creates a Razorpay order server-side. Amount is set here,
//  never trusted from the client.
// ═══════════════════════════════════════════════════════════════

const Razorpay = require('razorpay');

const PKG_PRICES = {
  professional: 49900,   // ₹499
  analyst:      79900,   // ₹799
  genius:       99900,   // ₹999
  specialist:   99900,   // ₹999
};

const PKG_NAMES = {
  professional: 'Excel UNLOCKED — Professional Package',
  analyst:      'Excel UNLOCKED — Analyst Package',
  genius:       'Excel UNLOCKED — Genius Package',
  specialist:   'Excel UNLOCKED — Specialist Package',
};

module.exports = async function handler(req, res){

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  const { package: pkg, uid } = req.body;

  if(!pkg || !PKG_PRICES[pkg]){
    return res.status(400).json({ error: 'Invalid package' });
  }
  if(!uid){
    return res.status(400).json({ error: 'User ID required' });
  }

  try{
    const razorpay = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount:   PKG_PRICES[pkg],      // in paise
      currency: 'INR',
      receipt:  `exl_${pkg}_${uid.slice(0,8)}_${Date.now()}`,
      notes: {
        package:  pkg,
        uid:      uid,
        product:  PKG_NAMES[pkg],
      }
    });

    return res.status(200).json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      package:  pkg,
    });

  } catch(err){
    console.error('Razorpay order creation failed:', err);
    return res.status(500).json({ error: 'Could not create order. Try again.' });
  }
};
