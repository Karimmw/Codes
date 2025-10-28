// api/telegram.js - Updated with OTC detection and clean output
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
    const messageId = message.message_id;
    
    console.log('Full message:', text);
    console.log(`Processing message ${messageId}`);

    // Parse signal
    const parsed = parseSignalFields(text);
    console.log('Parsed:', parsed);

    if (parsed.pair && parsed.direction) {
      await updateGitHub(parsed);
      console.log(`✅ Success: ${parsed.pair} ${parsed.direction} OTC:${parsed.otc}`);
      return res.status(200).json({ success: true, pair: parsed.pair });
    } else {
      console.log('❌ Missing required fields');
      console.log('Available fields:', { pair: parsed.pair, direction: parsed.direction });
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
    otc: "No" // Default to "No"
  };
  
  console.log('Raw text for parsing:', rawText);

  // Clean the text and split into lines
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  console.log('Lines:', lines);

  // 1. Pair - improved to handle your format and detect OTC
  for (let line of lines) {
    // Match "Pair: EURCAD" or "Pair: CHFJPY-OTC"
    const pairMatch = line.match(/pair\s*:\s*([A-Z]{6}(-OTC)?)/i);
    if (pairMatch) {
      result.pair = pairMatch[1].toUpperCase();
      
      // Detect OTC - check if pair contains "-OTC"
      if (result.pair.includes('-OTC')) {
        result.otc = "Yes";
        // Remove -OTC from pair name for cleaner output
        result.pair = result.pair.replace('-OTC', '');
      } else {
        result.otc = "No";
      }
      
      console.log('Found pair:', result.pair, 'OTC:', result.otc);
      break;
    }
  }

  // 2. Expiry - improved to handle your format
  for (let line of lines) {
    // Match "EXP: M1"
    const expiryMatch = line.match(/exp\s*:\s*([MW]\d+)/i);
    if (expiryMatch) {
      result.expiry = expiryMatch[1].toUpperCase();
      console.log('Found expiry:', result.expiry);
      break;
    }
  }

  // 3. Direction - improved to handle emojis and your format
  for (let line of lines) {
    const cleanLine = line.replace(/[🔽🔼▶️▼▲▶🟢🔴]/g, '').trim(); // Remove direction emojis
    const upperLine = cleanLine.toUpperCase();
    
    console.log('Checking line for direction:', cleanLine);
    
    if (upperLine.includes('BUY') || upperLine.includes('CALL') || /\bBU\b/.test(upperLine)) {
      result.direction = 'BUY';
      console.log('Found direction: BUY');
      break;
    }
    if (upperLine.includes('SELL') || upperLine.includes('PUT') || /\bSE\b/.test(upperLine)) {
      result.direction = 'SELL';
      console.log('Found direction: SELL');
      break;
    }
  }

  // 4. Fire time - improved to handle clock emoji
  for (let line of lines) {
    // Match "⌚️ 10:03:00" or "10:03:00"
    const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2})/);
    if (timeMatch) {
      result.fireTime = timeMatch[1];
      console.log('Found fire time:', result.fireTime);
      break;
    }
  }

  console.log('Final parsed result:', result);
  return result;
}

async function updateGitHub(signalData) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) throw new Error('No GitHub token');

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TARGET_PATH}`;
  const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json"
  };

  // Get current SHA
  const getResponse = await fetch(`${url}?ref=${BRANCH}`, { headers });
  let sha = null;
  if (getResponse.status === 200) {
    const fileData = await getResponse.json();
    sha = fileData.sha;
    console.log('Found existing file with SHA:', sha);
  } else if (getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`GitHub GET failed: ${getResponse.status} - ${errorText}`);
  }

  // Prepare clean content - ONLY the essential fields
  const payloadObj = {
    pair: signalData.pair,
    expiry: signalData.expiry,
    direction: signalData.direction,
    fireTime: signalData.fireTime,
    otc: signalData.otc
  };

  const content = JSON.stringify(payloadObj, null, 2);
  const encoded = Buffer.from(content).toString('base64');

  const payload = {
    message: `Signal: ${signalData.pair} ${signalData.direction} ${signalData.otc === 'Yes' ? 'OTC' : ''}`,
    content: encoded,
    branch: BRANCH
  };

  if (sha) payload.sha = sha;

  console.log('Updating GitHub with clean data:', payloadObj);

  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (putResponse.status !== 200 && putResponse.status !== 201) {
    const errorText = await putResponse.text();
    throw new Error(`GitHub PUT failed: ${putResponse.status} - ${errorText}`);
  }

  console.log('✅ GitHub file updated successfully');
}
