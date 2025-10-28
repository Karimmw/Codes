export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  try {
    // Forward to your DigitalOcean server INSTANTLY
    const response = await fetch('http://167.99.102.14:3000/webhook/telegram', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Telegram-Webhook'
      },
      body: JSON.stringify(req.body)
    });
    
    console.log('✅ Forwarded to DigitalOcean server');
    res.status(200).end();
  } catch (error) {
    console.error('Forward error:', error);
    // Always return 200 to Telegram
    res.status(200).end();
  }
}
