// api/telegram.js - Ably real-time messaging
import { Buffer } from 'buffer';

const GITHUB_OWNER = "Karimmw";
const GITHUB_REPO = "Codes";
const TARGET_PATH = "Sigs.json";
const BRANCH = "main";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('📨 Received Telegram webhook');
    const update = req.body;
    const message = update.message || update.channel_post;
    
    if (!message) {
      console.log('No message found');
      return res.status(200).json({ status: 'ok' });
    }

    const text = message.text || message.caption || '';
    
    console.log('Full message:', text);

    // Parse signal
    const parsed = parseSignalFields(text);
    console.log('Parsed:', parsed);

    if (parsed.pair && parsed.direction) {
      // INSTANT broadcast via Ably (handles 500K/month free)
      await broadcastViaAbly(parsed);
      
      // Optional: Update GitHub as backup
      await updateGitHub(parsed);
      
      console.log(`✅ Ably broadcast: ${parsed.pair} ${parsed.direction}`);
      return res.status(200).json({ success: true, pair: parsed.pair });
    } else {
      console.log('❌ Missing required fields');
      return res.status(200).json({ skipped: true, reason: 'Missing pair or direction' });
    }

  } catch (error) {
    console.error('🚨 Error:', error);
    return res.status(200).json({ error: error.message });
  }
}

function parseSignalFields(rawText) {
  const result = { 
    pair: null, 
    expiry: null, 
    direction: null, 
    fireTime: null,
    otc: "No"
  };
  
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Pair with OTC detection
  for (let line of lines) {
    const pairMatch = line.match(/pair\s*:\s*([A-Z]{6}(-OTC)?)/i);
    if (pairMatch) {
      result.pair = pairMatch[1].toUpperCase();
      
      if (result.pair.includes('-OTC')) {
        result.otc = "Yes";
        result.pair = result.pair.replace('-OTC', '');
      } else {
        result.otc = "No";
      }
      break;
    }
  }

  // Expiry
  for (let line of lines) {
    const expiryMatch = line.match(/exp\s*:\s*([MW]\d+)/i);
    if (expiryMatch) {
      result.expiry = expiryMatch[1].toUpperCase();
      break;
    }
  }

  // Direction
  for (let line of lines) {
    const cleanLine = line.replace(/[🔽🔼▶️▼▲▶🟢🔴]/g, '').trim();
    const upperLine = cleanLine.toUpperCase();
    
    if (upperLine.includes('BUY') || upperLine.includes('CALL') || /\bBU\b/.test(upperLine)) {
      result.direction = 'BUY';
      break;
    }
    if (upperLine.includes('SELL') || upperLine.includes('PUT') || /\bSE\b/.test(upperLine)) {
      result.direction = 'SELL';
      break;
    }
  }

  // Fire time
  for (let line of lines) {
    const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2})/);
    if (timeMatch) {
      result.fireTime = timeMatch[1];
      break;
    }
  }

  return result;
}

async function broadcastViaAbly(signalData) {
  const ABLY_API_KEY = process.env.ABLY_API_KEY;
  
  if (!ABLY_API_KEY) {
    throw new Error('ABLY_API_KEY environment variable is not set');
  }

  // Ably REST API call
  const response = await fetch('https://rest.ably.io/channels/trading-signals/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(ABLY_API_KEY).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'new-signal',
      data: signalData
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ably broadcast failed: ${response.status} - ${errorText}`);
  }

  console.log('✅ Signal broadcasted via Ably');
}

async function updateGitHub(signalData) {
  // Your existing GitHub update code here
  // (keep as backup)
}
