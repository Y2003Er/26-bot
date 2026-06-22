// commands/getpp.js – FIXED FOR YOUR SPECIFIC HANDLER
import axios from 'axios';

export default {
    name: 'getpp',
    aliases: ['gp', 'getpic'],
    category: 'general',
    description: 'Get profile picture of a user',
    usage: '.getpp (reply to message or tag user)',
    
    async execute(sock, msg, args) {
        const chatJid = msg.key.remoteJid;

        // Function rahisi ya kujibu ujumbe papo hapo kulingana na handler yako
        const reply = async (text) => {
            await sock.sendMessage(chatJid, { text: text }, { quoted: msg });
        };

        try {
            let targetUser = null;
            
            // Angalia kama amemjibu mtu (Reply)
            const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;
            
            if (quotedMessage) {
                // Pata JID ya mtu aliyejibiwa
                targetUser = contextInfo.participant;
            } else {
                // Angalia kama kuna mtu katagwa (Mentioned)
                const mentionedJid = contextInfo?.mentionedJid;
                if (mentionedJid && mentionedJid.length > 0) {
                    targetUser = mentionedJid[0];
                } else {
                    // Kama hajamtag mtu wala kumjibu mtu, tumia aliyetuma ujumbe huu sasa hivi
                    targetUser = msg.key.participant || chatJid;
                }
            }
            
            // Kusafisha JID (kuondoa vile viji-namba vya devices vya :1, :2 n.k.)
            if (targetUser && targetUser.includes(':')) {
                targetUser = targetUser.split(':')[0] + '@s.whatsapp.net';
            }
            
            if (!targetUser) {
                return await reply('❌ Could not identify target user. Please reply to a message or tag a user.');
            }
            
            try {
                // Tafuta Profile Picture kutoka WhatsApp Seva (Baileys v7)
                const ppUrl = await sock.profilePictureUrl(targetUser, 'image');
                
                if (!ppUrl) {
                    return await reply('❌ Profile picture not found or it is private for this user.');
                }
                
                // Download picha kwa kutumia axios
                const response = await axios.get(ppUrl, { responseType: 'arraybuffer' });
                const buffer = Buffer.from(response.data);
                
                // Tuma picha kwenye group au DM husika
                await sock.sendMessage(chatJid, { 
                    image: buffer,
                    caption: `👤 Profile picture of @${targetUser.split('@')[0]}`,
                    mentions: [targetUser]
                }, { quoted: msg });
                
            } catch (profileError) {
                // Ukamataji wa makosa ya faragha (Privacy Settings)
                return await reply('❌ Profile picture is private or not available for this user.');
            }
            
        } catch (error) {
            await reply('❌ Failed to process profile picture request.');
        }
    }
};
