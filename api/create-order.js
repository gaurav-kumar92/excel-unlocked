const Razorpay = require('razorpay');

// ₹99 = 9900 paise (Razorpay uses paise)
const PKG_PRICES = {
  professional: 9900,
  analyst:      9900,
  genius:       9900,
  specialist:   9900,
};

const PKG_NAMES = {
  professional: 'Excel UNLOCKED — Professional Package',
  analyst:      'Excel UNLOCKED — Analyst Package',
  genius:       'Excel UNLOCKED — Genius Package',
  specialist:   'Excel UNLOCKED — Specialist Package',
};

module.exports = async function handler(req, res){
  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { package: pkg, uid } = req.body;
  if(!pkg || !PKG_PRICES[pkg]) return res.status(400).json({ error: 'Invalid package' });
  if(!uid) return res.status(400).json({ error: 'User ID required' });

  try{
    const razorpay = new Razorpay({
      key_id:     'rzp_live_SVQQmA759zXi6T',
      key_secret: 'OwhfmucwgUxmLCTcha1SWEgR',   // ← paste your secret key here
    });

    const order = await razorpay.orders.create({
      amount:   PKG_PRICES[pkg],
      currency: 'INR',
      receipt:  `exl_${pkg}_${uid.slice(0,8)}_${Date.now()}`,
      notes:    { package: pkg, uid: uid, product: PKG_NAMES[pkg] }
    });

    return res.status(200).json({
      order_id: order.id,
      amount:   order.amount,
      currency: order.currency,
      package:  pkg,
    });

  } catch(err){
    console.error('Razorpay order creation failed:', err.message);
    return res.status(500).json({ error: 'Could not create order: ' + err.message });
  }
};
