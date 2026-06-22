export const name = 'statuslike';
export const description = 'Washa/zima auto like status';
export const category = 'owner';
export const ownerOnly = true;

export async function execute(sock, msg, args) {
    const option = args[0]?.toLowerCase();
    
    if (option === 'on') {
        global.autoStatusLike = true;
        await sock.sendMessage(msg.key.remoteJid, { 
            text: '✅ Auto status like imewashwa' 
        }, { quoted: msg });
    } 
    else if (option === 'off') {
        global.autoStatusLike = false;
        await sock.sendMessage(msg.key.remoteJid, { 
            text: '❌ Auto status like imezimwa' 
        }, { quoted: msg });
    } 
    else {
        await sock.sendMessage(msg.key.remoteJid, { 
            text: `📊 Auto status like: ${global.autoStatusLike ? 'ON' : 'OFF'}\n\nTumia:\n.statuslike on\n.statuslike off` 
        }, { quoted: msg });
    }
}