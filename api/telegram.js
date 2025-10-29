// api/telegram.js - Simple forwarder to DigitalOcean mirror
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }
  
  try {
    console.log('📨 Received Telegram webhook - forwarding to mirror');
    
    // Forward to DigitalOcean mirror server
    const response = await fetch('http://167.99.102.14:3000/webhook/telegram', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    
    const result = await response.json();
    console.log('✅ Mirror server response:', result);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('🚨 Forward error:', error.message);
    res.status(200).end();
  }
}
