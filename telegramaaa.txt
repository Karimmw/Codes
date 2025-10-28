// telegram.js - Main webhook handler (root directory)
const GITHUB_OWNER = "Karimmw";
const GITHUB_REPO = "Codes";
const TARGET_PATH = "Sigs.json";
const BRANCH = "main";

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    console.log('Received update:', JSON.stringify(update));

    // Extract message from update (supports both message and channel_post)
    const message = update.message || update.channel_post;
    
    if (!message) {
      console.log('No message found in update');
      return res.status(200).json({ status: 'ok', message: 'No message to process' });
    }

    const text = message.text || message.caption || '';
    const messageId = message.message_id;
    
    console.log(`Processing message ${messageId}: ${text.substring(0, 50)}...`);

    // Parse the signal
    const parsed = parseSignalFields(text);
    console.log('Parsed signal:', parsed);

    // Only update if we have essential fields
    if (parsed.pair && parsed.direction) {
      await updateGitHub(parsed, messageId);
      console.log(`✅ Successfully processed signal for ${parsed.pair}`);
      
      return res.status(200).json({ 
        status: 'success', 
        pair: parsed.pair,
        direction: parsed.direction,
        message: 'Signal processed successfully'
      });
    } else {
      console.log('❌ Missing essential fields, skipping');
      return res.status(200).json({ 
        status: 'skipped', 
        reason: 'Missing pair or direction' 
      });
    }

  } catch (error) {
    console.error('🚨 Error processing webhook:', error);
    // Always return 200 to Telegram to avoid retries
    return res.status(200).json({ 
      status: 'error', 
      error: error.message 
    });
  }
}

function parseSignalFields(rawText) {
  const result = {
    pair: null,
    expiry: null,
    direction: null,
    fireTime: null,
  };

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  // 1. Pair
  for (let line of lines) {
    const pairMatch = line.match(/pair\s*[:\-]?\s*([A-Z]{6}-?[A-Z]{3})/i);
    if (pairMatch) {
      result.pair = pairMatch[1].toUpperCase().replace(/\s+/g, '');
      break;
    }
  }

  // 2. Expiry
  for (let line of lines) {
    const expiryMatch = line.match(/exp\s*[:\-]?\s*([MW]\d+)/i);
    if (expiryMatch) {
      result.expiry = expiryMatch[1].toUpperCase();
      break;
    }
  }

  // 3. Direction
  for (let line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.includes("BUY") || upperLine.includes("CALL") || /\bBU\b/.test(upperLine)) {
      result.direction = "BUY";
      break;
    }
    if (upperLine.includes("SELL") || upperLine.includes("PUT") || /\bSE\b/.test(upperLine)) {
      result.direction = "SELL";
      break;
    }
  }

  // 4. Fire time
  for (let line of lines) {
    const timeMatch = line.match(/(\d{1,2}:\d{2}:\d{2})/);
    if (timeMatch) {
      result.fireTime = timeMatch[1];
      break;
    }
  }

  return result;
}

async function updateGitHub(signalData, messageId) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TARGET_PATH}`;
  
  const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Telegram-Signal-Bot"
  };

  // Get current file to obtain SHA
  const getResponse = await fetch(`${url}?ref=${BRANCH}`, {
    method: 'GET',
    headers: headers
  });

  let sha = null;
  if (getResponse.status === 200) {
    const fileData = await getResponse.json();
    sha = fileData.sha;
    console.log('Found existing file with SHA:', sha);
  } else if (getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`GitHub GET failed: ${getResponse.status} - ${errorText}`);
  }

  // Add timestamp and message ID to signal data
  const payloadObj = {
    ...signalData,
    timestamp: new Date().toISOString(),
    message_id: messageId
  };

  const fileContent = JSON.stringify(payloadObj, null, 2);
  const encodedContent = Buffer.from(fileContent).toString('base64');

  const payload = {
    message: `Signal update: ${signalData.pair} - ${new Date().toISOString()}`,
    content: encodedContent,
    branch: BRANCH
  };

  if (sha) {
    payload.sha = sha;
  }

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
