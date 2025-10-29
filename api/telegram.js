// api/telegram.js - Updated for new server IP
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }
  
  try {
    console.log('📨 Received Telegram webhook - forwarding to NEW server');
    
    // Forward to NEW DigitalOcean server
    const response = await fetch('http://165.227.216.188:3000/webhook/telegram', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const result = await response.json();
    console.log('✅ NEW Server response:', result);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('🚨 Forward error:', error.message);
    res.status(200).end();
  }
}
