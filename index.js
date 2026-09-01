require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' }), // pon 'info' si quieres ver más detalle
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexión cerrada. ¿Reconectar?', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Bot conectado a WhatsApp');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      '';
    if (!text) return;

    const chatId = msg.key.remoteJid;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: text,
      });
      await sock.sendMessage(chatId, { text: response.text });
    } catch (err) {
      console.error('Error con Gemini:', err);
      await sock.sendMessage(chatId, { text: '⚠️ Hubo un error consultando a Gemini.' });
    }
  });
}

startBot();
