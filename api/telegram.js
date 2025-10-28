// api/telegram.js
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
    return res.status(200).json({ error: error
