/**
 * commands/github.js
 * Angalia takwimu za project yako ya GitHub — Toleo la 26-TECH
 */

import axios from 'axios';

export const name        = 'github';
export const description = 'Angalia takwimu za repository ya GitHub';
export const category    = 'general';
export const use         = '[link ya repo]';
export const alias       = ['repo', 'git', 'source', 'sc', 'script'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const chatId = msg.key.remoteJid;
    
    // Kama hajaweka repo, inaangalia repo yako ya 26-tech-suite kiatomatiki!
    let repoInput = args[0]?.trim() || 'https://github.com/Y2003Er/26-tech-suite';
    
    // Safisha link ili kupata user na repo name
    let cleanPath = repoInput.replace('https://github.com/', '').replace('.git', '');
    const parts = cleanPath.split('/');
    
    if (parts.length < 2) {
        return await sock.sendMessage(chatId, { text: '❌ Link ya GitHub sio sahihi.' }, { quoted: msg });
    }

    const username = parts[0];
    const repoName = parts[1];

    try {
        const apiUrl = `https://api.github.com/repos/${username}/${repoName}`;
        const response = await axios.get(apiUrl, { headers: { 'User-Agent': '26-TECH-BOT' } });
        const repo = response.data;

        let message = `╭━━『 *𝖦𝗂𝗍𝖧𝗎𝖻 𝖱𝖾𝖿𝖾𝗋𝖾𝗇𝖼𝖾* 』━━╮\n\n`;
        message += `🚀 *Repository:* ${repo.name}\n`;
        message += `👤 *Owner:* ${repo.owner.login}\n`;
        message += `📝 *Description:* ${repo.description || 'Hakuna maelezo'}\n`;
        message += `🌟 *Stars:* ${repo.stargazers_count}\n`;
        message += `🍴 *Forks:* ${repo.forks_count}\n`;
        message += `🔧 *Language:* ${repo.language || 'Unknown'}\n`;
        message += `🔗 *URL:* ${repo.html_url}\n\n`;
        message += `╰━━━━━━━━━━━━━━━╯\n\n`;
        message += `_⚡ Powered by 26-𝚃𝙴𝙲𝙷_`;

        await sock.sendMessage(chatId, { text: message }, { quoted: msg });
    } catch (apiError) {
        // Fallback kashabiki kama GitHub API ikileta maringo
        let fallback = `╭━━『 *𝖦𝗂𝗍𝖧𝗎𝖻 𝖱𝖾𝖿𝖾𝗋𝖾𝗇𝖼𝖾* 』━━╮\n\n`;
        fallback += `🚀 *Repository:* ${repoName}\n`;
        fallback += `👤 *Owner:* ${username}\n`;
        fallback += `🔗 *URL:* ${repoInput}\n\n`;
        fallback += `╰━━━━━━━━━━━━━━━╯`;
        await sock.sendMessage(chatId, { text: fallback }, { quoted: msg });
    }
}
