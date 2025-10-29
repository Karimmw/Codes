// api/telegram.js - Updates GitHub directly + forwards to DigitalOcean
const GITHUB_OWNER = "Karimmw";
const GITHUB_REPO = "Codes";
const TARGET_PATH = "Sigs.json";
const BRANCH = "main";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed:', req.method);
    return res.status(405).end();
  }
  
  try {
    console.log('📨 Received Telegram webhook');
    
    const message = req.body.message || req.body.channel_post;
    
    // Check message age in Vercel too
    if (message && message.date) {
      const messageAge = Date.now() / 1000 - message.date; // seconds
      if (messageAge > 300) { // 5 minutes
        console.log(`⏰ Vercel: Ignoring old message (${messageAge.toFixed(0)}s old)`);
        return res.status(200).end();
      }
      console.log(`⏰ Vercel: Message age ${messageAge.toFixed(0)}s - processing`);
    }
    
    const text = message.text || message.caption || '';
    console.log('📝 Message text:', text);

    // Parse the signal
    const parsed = parseSignalFields(text);
    console.log('🎯 Parsed signal:', parsed);

    if (parsed.pair && parsed.direction) {
      // ⭐ UPDATE GITHUB DIRECTLY (INSTANT)
      await updateGitHub(parsed);
      console.log(`✅ GitHub updated: ${parsed.pair} ${parsed.direction}`);
      
      // Also forward to DigitalOcean for real-time (optional)
      try {
        await fetch('http://167.99.102.14:3000/webhook/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body)
        });
        console.log('✅ Also forwarded to DigitalOcean');
      } catch (doError) {
        console.log('⚠️ DigitalOcean forward failed (optional)');
      }
      
      res.status(200).json({ success: true, pair: parsed.pair });
    } else {
      console.log('❌ Missing required fields');
      res.status(200).json({ skipped: true });
    }
    
  } catch (error) {
    console.error('🚨 Error:', error);
    res.status(200).end();
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
    if (upperLine.includes('SELL') || upperSocket.includes('PUT') || /\bSE\b/.test(upperLine)) {
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

async function updateGitHub(signalData) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is not set');
  }

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${TARGET_PATH}`;
  
  const headers = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Vercel-Telegram-Bot"
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
    console.log('📁 Found existing GitHub file with SHA:', sha);
  } else if (getResponse.status !== 404) {
    const errorText = await getResponse.text();
    throw new Error(`GitHub GET failed: ${getResponse.status} - ${errorText}`);
  }

  // Prepare clean content
  const payloadObj = {
    pair: signalData.pair,
    expiry: signalData.expiry,
    direction: signalData.direction,
    fireTime: signalData.fireTime,
    otc: signalData.otc
  };

  const fileContent = JSON.stringify(payloadObj, null, 2);
  
  // Encode to base64
  const encodedContent = Buffer.from(fileContent).toString('base64');

  const payload = {
    message: `Signal: ${signalData.pair} ${signalData.direction} ${signalData.otc === 'Yes' ? 'OTC' : ''}`,
    content: encodedContent,
    branch: BRANCH
  };

  if (sha) {
    payload.sha = sha;
  }

  console.log('📤 Updating GitHub with:', payloadObj);

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
