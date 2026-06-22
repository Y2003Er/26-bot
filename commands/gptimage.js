/**
 * commands/gptimage.js
 * Hariri picha kwa kutumia GPT Vision — Toleo la ES Modules la 26-TECH
 */

import axios from 'axios';
import FormData from 'form-data';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import sharp from 'sharp';

export const name        = 'gptimage';
export const description = 'Hariri picha kwa kutumia GPT Vision na prompt';
export const category    = 'ai';
export const use         = '<prompt> (jibu picha au sticker)';
export const alias       = ['gptimg', 'editimage', 'aiimage', 'vision', 'gi'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;

    // Angalia kama ni reply ya picha
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!ctxInfo?.quotedMessage) {
        return await sock.sendMessage(from, {
            text: `📷 *GPT Image Editor*\n\nJibu *picha* au *sticker* na prompt yako.\n\nMfano: .gptimage fanya mandhari ya bahari`
        }, { quoted: msg });
    }

    const prompt = args.join(' ').trim();
    if (!prompt) {
        return await sock.sendMessage(from, {
            text: `❌ Tafadhali andika prompt!\n\nMfano: .gptimage change the background to a beach`
        }, { quoted: msg });
    }

    const quotedMsg = ctxInfo.quotedMessage;
    const isImage   = !!quotedMsg.imageMessage;
    const isSticker = !!quotedMsg.stickerMessage;

    if (!isImage && !isSticker) {
        return await sock.sendMessage(from, {
            text: '❌ Tafadhali jibu *picha* au *sticker* tu!'
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, { text: '🎨 *Nahariri picha yako, subiri kidogo...*' }, { quoted: msg });

        const targetMessage = {
            key: {
                remoteJid: from,
                id: ctxInfo.stanzaId,
                participant: ctxInfo.participant,
            },
            message: ctxInfo.quotedMessage,
        };

        // Pakua media
        const mediaBuffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        if (!mediaBuffer) {
            return await sock.sendMessage(from, {
                text: '❌ Imeshindwa kupakua picha. Jaribu tena.'
            }, { quoted: msg });
        }

        // Badilisha sticker kuwa PNG kama ni sticker
        let imageBuffer = mediaBuffer;
        if (isSticker) {
            const stickerMessage = quotedMsg.stickerMessage;
            const isAnimated = stickerMessage.isAnimated || stickerMessage.mimetype?.includes('animated');

            if (isAnimated) {
                return await sock.sendMessage(from, {
                    text: '❌ Sticker za animation hazisaidiwi. Tumia picha au sticker ya kawaida.'
                }, { quoted: msg });
            }

            try {
                imageBuffer = await sharp(mediaBuffer).png().toBuffer();
            } catch (error) {
                console.error('Error converting sticker:', error);
                return await sock.sendMessage(from, {
                    text: '❌ Imeshindwa kubadilisha sticker kuwa picha. Jaribu na picha ya kawaida.'
                }, { quoted: msg });
            }
        }

        // Badilisha kuwa JPEG kama si JPEG
        let finalImageBuffer = imageBuffer;
        try {
            const metadata = await sharp(imageBuffer).metadata();
            if (metadata.format !== 'jpeg' && metadata.format !== 'jpg') {
                finalImageBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
            }
        } catch (error) {
            console.error('Sharp error:', error);
            finalImageBuffer = imageBuffer;
        }

        // Andaa form data
        const form = new FormData();
        form.append('image', finalImageBuffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });
        form.append('param', prompt);

        // Tuma ombi kwa API
        const response = await axios.post('https://api.nexray.web.id/ai/gptimage', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 10 * 1024 * 1024,
        });

        if (!response.data) {
            return await sock.sendMessage(from, {
                text: '❌ Picha haikupokelewa kutoka API. Jaribu tena.'
            }, { quoted: msg });
        }

        const resultImageBuffer = Buffer.from(response.data);

        if (!resultImageBuffer || resultImageBuffer.length === 0) {
            return await sock.sendMessage(from, {
                text: '❌ Picha tupu imepokelewa. Jaribu tena.'
            }, { quoted: msg });
        }

        const maxImageSize = 5 * 1024 * 1024;
        if (resultImageBuffer.length > maxImageSize) {
            return await sock.sendMessage(from, {
                text: `❌ Picha ni kubwa sana: ${(resultImageBuffer.length / 1024 / 1024).toFixed(2)}MB (max 5MB)`
            }, { quoted: msg });
        }

        await sock.sendMessage(from, {
            image: resultImageBuffer,
            caption: `✨ *GPT Vision Result*\n📝 *Prompt:* ${prompt}\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

    } catch (error) {
        console.error('GPT Image error:', error);

        if (error.response?.status === 400) {
            await sock.sendMessage(from, { text: '❌ Ombi baya. Angalia prompt na picha yako.' }, { quoted: msg });
        } else if (error.response?.status === 429) {
            await sock.sendMessage(from, { text: '❌ Ombi nyingi sana. Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.response?.status === 500) {
            await sock.sendMessage(from, { text: '❌ Hitilafu ya seva. Jaribu tena baadaye.' }, { quoted: msg });
        } else if (error.code === 'ECONNABORTED') {
            await sock.sendMessage(from, { text: '❌ Muda umekwisha. Usindikaji ulichukua muda mrefu.' }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: `❌ Hitilafu: ${error.message || 'Kosa lisilojulikana'}` }, { quoted: msg });
        }
    }
}
