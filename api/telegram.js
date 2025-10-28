// api/telegram.js
const GITHUB_OWNER = "Karimmw";
const GITHUB_REPO = "Codes";
const TARGET_PATH = "codes/Sigs.json";
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
    
    console.log(`Processing message ${messageId}: ${text.substring(0, 100)}`);

    // Parse signal
    const parsed = parseSignalFields(text);
    console.log('Parsed:', parsed);

    if (parsed.pair && parsed.direction) {
      await updateGitHub(parsed, messageId);
      console.log(`✅ Success: ${parsed.pair} ${parsed.direction}`);
      return res.status(200).json({ success: true, pair: parsed.pair });
    } else {
      console.log('❌ Missing required fields');
      return res.status(200).json({ skipped: true });
    }

  } catch (error) {
    console.error('🚨 Error:', error);
    return res.status(200).json({ error: error.message });
  }
}

function parseSignalFields(rawText) {
  const result = { pair: null, expiry: null, direction: null, fireTime: null };
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);

  // Pair
  for (let line of lines) {
    const pairMatch = line.match(/pair\s*:\s*([A-Z]{6}-?[A-Z]{3})/i);
    if (pairMatch) {
      result.pair = pairMatch[1].toUpperCase();
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
    const upper = line.toUpperCase();
    if (upper.includes('BUY') || upper.includes('CALL') || /\bBU\b/.test(upper)) {
      result.direction = 'BUY';
      break;
    }
    if (upper.includes('SELL') || upper.includes('PUT') || /\bSE\b/.test(upper)) {
      result.direction = 'SELL';
      break;
    }
  }

  // Fire time
  for (let line of lines) {
    const timeMatch = line.match(/(\d{2}:\d{2}:\d{2})/);
    if (timeMatch) {
      result.fireTime = timeMatch[1];
      break;
    }
  }

  return result;
}

async function updateGitHub(signalData, messageId) {
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
  }

  // Prepare content
  const payloadObj = {
    ...signalData,
    timestamp: new Date().toISOString(),
    message_id: messageId
  };

  const content = JSON.stringify(payloadObj, null, 2);
  const encoded = Buffer.from(content).toString('base64');

  const payload = {
    message: `Signal: ${signalData.pair} - ${new Date().toISOString()}`,
    content: encoded,
    branch: BRANCH
  };

  if (sha) payload.sha = sha;

  const putResponse = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (putResponse.status !== 200 && putResponse.status !== 201) {
    throw new Error(`GitHub error: ${putResponse.status}`);
  }
}
