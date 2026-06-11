/**
 * commands/video.js
 * Download video kutoka YouTube — Toleo la Kasi na Uhakika la 26-TECH
 */

import yts from 'yt-search';

export const name        = 'video';
export const description = 'Download video kutoka YouTube kwa kasi ya juu';
export const category    = 'media';
export const use         = '<jina la video au link>';
export const alias       = ['ytv', 'ytmp4', 'ytvid'];
export const adminOnly   = false;

export async function execute(sock, msg, args) {
    const from = msg.key.remoteJid;
    const text = args.join(' ').trim();

    if (!text) {
        return await sock.sendMessage(from, { 
            text: `❌ Tafadhali andika jina la video au uweke link ya YouTube.\nMfano: .video Alikiba New Song` 
        }, { quoted: msg });
    }

    const { default: APIs } = await import('../api.js');

    try {
        await sock.sendMessage(from, { text: '⏳ *Natafuta na kupakua video yako, subiri sekunde chache...*' }, { quoted: msg });

        let videoUrl = '';
        let videoTitle = '';

        // 1. Angalia kama mtumiaji ameweka link au jina la utafutaji
        if (text.startsWith('http://') || text.startsWith('https://')) {
            videoUrl = text;
            try {
                const searchLink = await yts(text);
                if (searchLink && searchLink.videos.length > 0) {
                    videoTitle = searchLink.videos[0].title;
                }
            } catch (_) {}
        } else {
            const { videos } = await yts(text);
            if (!videos || videos.length === 0) {
                return await sock.sendMessage(from, { text: '❌ Video haijapatikana!' }, { quoted: msg });
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
        }

        const finalTitle = videoTitle || 'Video';
        let downloadUrl = null;

        console.log(`🔄 [26-TECH] Kuanza kutafuta video kwa mpigo: ${videoUrl}`);

        // 2. Mfumo wa Fast-Fallback: Kila seva inapewa max sekunde 8. Ikizingua inaruka sekunde hiyo hiyo!
        // Seva ya 1: Yupro
        try {
            const res1 = await Promise.race([
                APIs.getYupraVideoByUrl(videoUrl),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
            ]);
            if (res1 && res1.download) {
                downloadUrl = res1.download;
                console.log('✅ Video: Yupro Imefanikiwa');
            }
        } catch (e) {
            console.warn('⚠️ Video: Yupro imefeli au imechukua muda mrefu.');
        }

        // Seva ya 2: Okatsu
        if (!downloadUrl) {
            try {
                const res2 = await Promise.race([
                    APIs.getOkatsuVideoByUrl(videoUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                ]);
                if (res2 && res2.download) {
                    downloadUrl = res2.download;
                    console.log('✅ Video: Okatsu Imefanikiwa');
                }
            } catch (e) {
                console.warn('⚠️ Video: Okatsu imefeli au imechukua muda mrefu.');
            }
        }

        // Seva ya 3: EliteProTech
        if (!downloadUrl) {
            try {
                const res3 = await Promise.race([
                    APIs.getEliteProTechVideoByUrl(videoUrl),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
                ]);
                if (res3 && res3.download) {
                    downloadUrl = res3.download;
                    console.log('✅ Video: EliteProTech Imefanikiwa');
                }
            } catch (e) {
                console.error('❌ Video: Seva zote zimegoma.');
            }
        }

        // 3. Kama hakuna link yoyote iliyopatikana
        if (!downloadUrl) {
            return await sock.sendMessage(from, { 
                text: '❌ Imeshindwa kupakua video hii kwa sasa. Seva zote ziko bize au zimezuiwa na YouTube.' 
            }, { quoted: msg });
        }

        // 4. Kutuma video kwenda WhatsApp kwa kutumia Streaming Link (HAKUNA BUFFER)
        const safeFileName = finalTitle.replace(/[^:\w\s-]/g, '').trim() || 'video';
        
        await sock.sendMessage(from, {
            video: { url: downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${safeFileName}.mp4`,
            caption: `🎬 *${finalTitle}*\n\n> *⚡ Powered by 26-𝐓𝐄𝐂𝐇*`
        }, { quoted: msg });

        console.log(`✅ [26-TECH] Video imetumwa kwa mafanikio: ${finalTitle}`);

    } catch (error) {
        console.error('Video fatal error:', error);
        await sock.sendMessage(from, { text: `❌ Hitilafu ya mfumo: ${error.message}` }, { quoted: msg });
    }
}
