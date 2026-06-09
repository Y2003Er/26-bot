/**
 * commands/eval.js
 * Command ya .eval iliyoboreshwa kwa ajili ya Ma-Owner Wengi kutoka .env
 */

import { exec } from 'child_process';
import util from 'util';

export const evalCommand = {
    name: ['eval', 'ev'],
    category: 'owner',
    desc: 'Inatekeleza kodi ya JS au Terminal (Ma-Owner Wote)',
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        
        // 🔍 1. Kagua namba ya mtumaji (Ulinzi wa Chuma kwa Ma-Owner Wengi)
        const sender = msg.key.participant || msg.key.remoteJid;
        const cleanSender = sender.split('@')[0].split(':')[0]; 
        
        // Inasoma namba na kuzigeuza kuwa Array: ['255753595142', '255712345678']
        const envOwners = process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER.split(',') : [];

        // Kagua kama namba ya mtumaji IMO kwenye orodha ya ma-owner
        const isOwner = envOwners.map(num => num.trim()).includes(cleanSender);

        if (!isOwner) {
            return await sock.sendMessage(from, { text: '⚠️ `Error: Access Denied. Hii command ni ya Owner pekee!`' }, { quoted: msg });
        }

        // 📝 2. Hakikisha kuna kodi iliyoandikwa baada ya command
        const text = args.join(' ');
        if (!text) {
            return await sock.sendMessage(from, { text: '💬 Tafadhali weka kodi au amri. Mfano:\n`.eval 2 + 2` au `.eval $ ls`' }, { quoted: msg });
        }

        // ⚡ 3. Angalia kama ni amri ya Terminal ($) au Kodi ya JS
        if (text.startsWith('$ ')) {
            const command = text.slice(2); 
            
            exec(command, async (error, stdout, stderr) => {
                let output = stdout || stderr;
                if (error) {
                    output = `Error: ${error.message}`;
                }
                const responseTxt = `*💻 [26-TECH TERMINAL OUTPUT]*\n\n\`\`\`text\n${output.trim()}\n\`\`\``;
                await sock.sendMessage(from, { text: responseTxt }, { quoted: msg });
            });
            
        } else {
            let txt = '';
            try {
                let evaled = eval(text);
                if (typeof evaled !== 'string') {
                    evaled = util.inspect(evaled);
                }
                txt = `*🟢 [26-TECH EVAL SUCCESS]*\n\n\`\`\`javascript\n${evaled}\n\`\`\``;
            } catch (err) {
                txt = `*🔴 [26-TECH EVAL ERROR]*\n\n\`\`\`text\n${err.message}\n\`\`\``;
            }

            await sock.sendMessage(from, { text: txt }, { quoted: msg });
        }
    }
};

export default evalCommand;
