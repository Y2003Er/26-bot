const {
   updateProfilePicture,
   parsedJid
} = require("../lib");

const {
   sck,
   smd,
   send,
   Config,
   tlang,
   sleep,
   getAdmin,
   prefix
} = require("../lib");

const astro_patch = require("../lib/plugins");
const { cmd } = astro_patch;

const grouppattern = /https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}/g;

// ====================== JOIN ======================
smd({
   cmdname: "join",
   info: "joins group by link",
   type: "whatsapp",
   fromMe: true,
   filename: __filename,
   use: "<group link.>"
}, async (_0x466dd8, _0x5b1338) => {
   try {
      if (_0x466dd8.reply_message && _0x466dd8.reply_message.groupInvite) {
         var _0x29e5fc = await _0x466dd8.bot.groupAcceptInviteV4(_0x466dd8.chat, _0x466dd8.reply_message.msg);
         if (_0x29e5fc && _0x29e5fc.includes("joined to:")) {
            return await send(_0x466dd8, "*_Joined_*", {}, "", _0x466dd8);
         }
      }
      let _0x208739 = _0x5b1338 ? _0x5b1338 : _0x466dd8.reply_text;
      const _0x47ed60 = _0x208739.match(grouppattern);
      if (!_0x47ed60) return await _0x466dd8.reply("*_Uhh Please, provide group link_*");
      let _0x4263be = _0x47ed60[0].split("https://chat.whatsapp.com/")[1].trim();
      await _0x466dd8.bot.groupAcceptInvite(_0x4263be)
         .then(() => send(_0x466dd8, "*_Joined_*", {}, "", _0x466dd8))
         .catch(() => _0x466dd8.send("*_Can't Join, Group Id not found!!_*"));
   } catch (_0x5d3484) {
      await _0x466dd8.error(_0x5d3484 + "\n\ncommand: join", _0x5d3484, "*_Can't Join, Group Id not found, Sorry!!_*");
   }
});

// ====================== NEWGC ======================
smd({
   cmdname: "newgc",
   info: "Create New Group",
   type: "whatsapp",
   filename: __filename,
   use: "<group name>"
}, async (_0x1d2f1f, _0x3c558e, { smd: _0x2e7a79, cmdName: _0x49994a }) => {
   try {
      if (!_0x1d2f1f.isCreator) return _0x1d2f1f.reply(tlang().owner);
      if (!_0x3c558e) return await _0x1d2f1f.reply(`*_provide Name to Create new Group!!!_*\n*_Ex: ${prefix + _0x2e7a79} My Name Group @user1,2,3.._*`);

      let _0x379d99 = _0x3c558e;
      if (_0x379d99.toLowerCase() === "info") {
         return await _0x1d2f1f.send(`\n  *Its a command to create new Gc*\n  \t\`\`\`Ex: ${prefix + _0x2e7a79} My new Group\`\`\`\n\n*You also add peoples in newGc*\n  \t\`\`\`just reply or mention Users\`\`\``.trim());
      }

      let _0x5a5c26 = [_0x1d2f1f.sender];
      if (_0x1d2f1f.quoted) _0x5a5c26.push(_0x1d2f1f.quoted.sender);
      if (_0x1d2f1f.mentionedJid && _0x1d2f1f.mentionedJid[0]) {
         _0x5a5c26.push(..._0x1d2f1f.mentionedJid);
      }

      const _0x37b490 = _0x379d99.substring(0, 60);
      const _0x417018 = await _0x1d2f1f.bot.groupCreate(_0x37b490, [..._0x5a5c26]);

      if (_0x417018) {
         let _0x2c6495 = await _0x1d2f1f.bot.sendMessage(_0x417018.id, { text: "*_Hey Master, Welcome to new Group_*\n" + Config.caption });
         let _0x3a49e9 = false;
         try { _0x3a49e9 = await _0x1d2f1f.bot.groupInviteCode(_0x417018.id); } catch {}
         const link = _0x3a49e9 ? `https://chat.whatsapp.com/${_0x3a49e9}` : "";

         const _0x539d8f = {
            externalAdReply: {
               title: "26-𝚃𝙴𝙲𝙷",
               body: _0x37b490,
               renderLargerThumbnail: true,
               thumbnail: log0,
               mediaType: 1,
               mediaUrl: link,
               sourceUrl: link
            }
         };
         return await send(_0x1d2f1f, (`*_Hurray, New group created!!!_*\n${link}`).trim(), { contextInfo: _0x539d8f }, "", _0x2c6495);
      }
      await _0x1d2f1f.send("*_Can't create new group, Sorry!!_*");
   } catch (_0x33d6f3) {
      await _0x1d2f1f.error(_0x33d6f3 + "\n\ncommand: " + _0x49994a, _0x33d6f3, "*_Can't create new group, Sorry!!_*");
   }
});

// ====================== GINFO ======================
smd({
   pattern: "ginfo",
   desc: "get group info by link",
   type: "group",
   filename: __filename,
   use: "<group link.>"
}, async (_0x4f7c88, _0x1490e0) => {
   try {
      let _0x3eb855 = _0x1490e0 ? _0x1490e0 : _0x4f7c88.reply_text;
      const _0x3e5033 = _0x3eb855.match(grouppattern) || false;
      if (!_0x3e5033) return await _0x4f7c88.reply("*_Uhh Please, provide group link_*");

      let _0x5ced5d = _0x3e5033[0].split("https://chat.whatsapp.com/")[1].trim();
      const _0x5f4890 = await _0x4f7c88.bot.groupGetInviteInfo(_0x5ced5d);

      if (_0x5f4890) {
         const _0x40ced5 = new Date(_0x5f4890.creation * 1000);
         var _0x236a49 = _0x40ced5.toISOString().split('T')[0];

         var _0x56eaaf = {
            externalAdReply: {
               title: "26-𝚃𝙴𝙲𝙷",
               body: _0x5f4890.subject,
               renderLargerThumbnail: true,
               thumbnail: log0,
               mediaType: 1,
               mediaUrl: _0x3e5033[0],
               sourceUrl: _0x3e5033[0]
            }
         };

         let msg = `\( {_0x5f4890.subject}\n\nCreator: wa.me/ \){_0x5f4890.owner?.split("@")[0]}\nGJid: \`\`\`${_0x5f4890.id}\`\`\`\n`;
         msg += `*Muted:* ${_0x5f4890.announce ? "yes" : "no"}\n*Locked:* ${_0x5f4890.restrict ? "yes" : "no"}\n`;
         msg += `*createdAt:* ${_0x236a49}\n*participants:* ${_0x5f4890.size}\n`;
         if (_0x5f4890.desc) msg += `*description:* ${_0x5f4890.desc}\n`;
         msg += `\n${Config.caption}`;

         return await send(_0x4f7c88, msg.trim(), { mentions: [_0x5f4890.owner], contextInfo: _0x56eaaf });
      }
      await _0x4f7c88.send("*_Group Id not found, Sorry!!_*");
   } catch (_0x36c345) {
      await _0x4f7c88.error(_0x36c345 + "\n\ncommand: ginfo", _0x36c345, "*_Group Id not found, Sorry!!_*");
   }
});

// ====================== REJECTALL ======================
smd({
   cmdname: "rejectall",
   alias: ["rejectjoin"],
   info: "reject all request to join!",
   type: "group",
   filename: __filename
}, async (_0xb81e45) => {
   try {
      if (!_0xb81e45.isGroup) return _0xb81e45.reply(tlang().group);
      if (!_0xb81e45.isBotAdmin || !_0xb81e45.isAdmin) return _0xb81e45.reply(!_0xb81e45.isBotAdmin ? "*_I'm Not Admin In This Group_*" : tlang().admin);

      const _0x4ea369 = await _0xb81e45.bot.groupRequestParticipantsList(_0xb81e45.chat);
      if (!_0x4ea369 || !_0x4ea369[0]) return await _0xb81e45.reply("*_No Request Join Yet_*");

      let _0x3b870c = [];
      let _0x32f437 = "*List of rejected users*\n\n";
      for (let req of _0x4ea369) {
         await _0xb81e45.bot.groupRequestParticipantsUpdate(_0xb81e45.chat, [req.jid], "reject");
         _0x32f437 += "@" + req.jid.split("@")[0] + "\n";
         _0x3b870c.push(req.jid);
      }
      await _0xb81e45.send(_0x32f437, { mentions: _0x3b870c });
   } catch (e) {
      await _0xb81e45.error(e + "\n\ncommand: rejectall", e);
   }
});

// ====================== ACCEPTALL ======================
smd({
   cmdname: "acceptall",
   alias: ["acceptjoin"],
   info: "accept all request to join!",
   type: "group",
   filename: __filename
}, async (_0x90a6de) => {
   try {
      if (!_0x90a6de.isGroup) return _0x90a6de.reply(tlang().group);
      if (!_0x90a6de.isBotAdmin || !_0x90a6de.isAdmin) return _0x90a6de.reply(!_0x90a6de.isBotAdmin ? "*_I'm Not Admin In This Group_*" : tlang().admin);

      const requests = await _0x90a6de.bot.groupRequestParticipantsList(_0x90a6de.chat);
      if (!requests?.length) return _0x90a6de.reply("*_No Join Request Yet_*");

      let text = "*List of accepted users*\n\n";
      let mentions = [];
      for (let req of requests) {
         await _0x90a6de.bot.groupRequestParticipantsUpdate(_0x90a6de.chat, [req.jid], "approve");
         text += "@" + req.jid.split("@")[0] + "\n";
         mentions.push(req.jid);
      }
      await _0x90a6de.send(text, { mentions });
   } catch (e) {
      await _0x90a6de.error(e + "\n\ncommand: acceptall", e);
   }
});

// ====================== LISTREQUEST ======================
smd({
   cmdname: "listrequest",
   alias: ["requestjoin"],
   type: "group",
   filename: __filename
}, async (_0x13cccd) => {
   try {
      if (!_0x13cccd.isGroup || !_0x13cccd.isBotAdmin || !_0x13cccd.isAdmin) return _0x13cccd.reply(tlang().admin);
      const requests = await _0x13cccd.bot.groupRequestParticipantsList(_0x13cccd.chat);
      if (!requests?.length) return _0x13cccd.reply("*_No Request Join Yet_*");

      let text = "*List of User Request to join*\n\n";
      let mentions = requests.map(r => r.jid);
      requests.forEach(r => text += "@" + r.jid.split("@")[0] + "\n");
      await _0x13cccd.send(text, { mentions });
   } catch (e) {
      await _0x13cccd.error(e + "\n\ncommand: listrequest", e);
   }
});

// ====================== SETDESC ======================
smd({
   cmdname: "setdesc",
   alias: ["setgdesc", "gdesc"],
   type: "group",
   filename: __filename,
   use: "<enter Description Text>"
}, async (_0x160b96, _0x4ef0da) => {
   try {
      if (!_0x160b96.isGroup) return _0x160b96.reply(tlang().group);
      if (!_0x4ef0da) return _0x160b96.reply("*Provide Description text*");
      if (!_0x160b96.isBotAdmin || !_0x160b96.isAdmin) return _0x160b96.reply(tlang().admin);

      await _0x160b96.bot.groupUpdateDescription(_0x160b96.chat, _0x4ef0da + "\n\n\t" + Config.caption);
      _0x160b96.reply("*_✅Group description Updated Successfuly!_*");
   } catch (e) {
      await _0x160b96.error(e + "\n\ncommand: setdesc", e);
   }
});

// ====================== SETNAME ======================
smd({
   cmdname: "setname",
   alias: ["setgname", "gname"],
   type: "group",
   filename: __filename,
   use: "<enter Name>"
}, async (_0x25d56b, _0x332d77) => {
   try {
      if (!_0x25d56b.isGroup) return _0x25d56b.reply(tlang().group);
      if (!_0x332d77) return _0x25d56b.reply("*Give text to Update This Group Name*");
      if (!_0x25d56b.isBotAdmin || !_0x25d56b.isAdmin) return _0x25d56b.reply(tlang().admin);

      await _0x25d56b.bot.groupUpdateSubject(_0x25d56b.chat, _0x332d77);
      _0x25d56b.reply("*_✅Group Name Updated Successfuly.!_*");
   } catch (e) {
      await _0x25d56b.error(e + "\n\ncommand: setname", e);
   }
});

// ====================== LEFT ======================
smd({
   cmdname: "left",
   info: "left from a group.",
   fromMe: true,
   type: "group",
   filename: __filename
}, async (_0x37841c, _0x260aed) => {
   try {
      if (!_0x37841c.isGroup) return _0x37841c.reply(tlang().group);
      if (_0x260aed.toLowerCase().match(/^(sure|yes|ok)$/)) {
         await _0x37841c.bot.groupParticipantsUpdate(_0x37841c.chat, [_0x37841c.user], "remove");
         _0x37841c.send("*Group Left!!*");
      } else {
         _0x37841c.send(`*_Use: ${prefix}left sure/yes/ok_*`);
      }
   } catch (e) {
      await _0x37841c.error(e + "\n\ncommand: left", e);
   }
});

// ====================== GPP & FULLGPP ======================
let mtypes = ["imageMessage"];

smd({
   pattern: "gpp",
   desc: "Set Group profile picture",
   category: "group",
   filename: __filename
}, async (_0x5ac912) => {
   try {
      if (!_0x5ac912.isGroup || !_0x5ac912.isBotAdmin || !_0x5ac912.isAdmin) return _0x5ac912.reply(tlang().admin);
      let _0xc0618e = mtypes.includes(_0x5ac912.mtype) ? _0x5ac912 : _0x5ac912.reply_message;
      if (!_0xc0618e?.imageMessage) return _0x5ac912.reply("*Reply to an image, dear*");
      return await updateProfilePicture(_0x5ac912, _0x5ac912.chat, _0xc0618e, "gpp");
   } catch (e) {
      await _0x5ac912.error(e + "\n\ncommand : gpp", e);
   }
});

smd({
   pattern: "fullgpp",
   desc: "Set full screen group profile picture",
   category: "group",
   filename: __filename
}, async (_0x31201a) => {
   try {
      if (!_0x31201a.isGroup || !_0x31201a.isBotAdmin || !_0x31201a.isAdmin) return _0x31201a.reply(tlang().admin);
      let _0x3fba56 = mtypes.includes(_0x31201a.mtype) ? _0x31201a : _0x31201a.reply_message;
      if (!_0x3fba56?.imageMessage) return _0x31201a.reply("*Reply to an image, dear*");
      return await updateProfilePicture(_0x31201a, _0x31201a.chat, _0x3fba56, "fullgpp");
   } catch (e) {
      await _0x31201a.error(e + "\n\ncommand : fullgpp", e);
   }
});

// ====================== TAGALL ======================
cmd({
   pattern: "tagall",
   desc: "Tags every person of group.",
   category: "group",
   filename: __filename
}, async (_0x1ed055, _0x929954) => {
   try {
      if (!_0x1ed055.isGroup) return _0x1ed055.reply(tlang().group);
      if (!_0x1ed055.isAdmin && !_0x1ed055.isCreator) return _0x1ed055.reply(tlang().admin);

      const participants = _0x1ed055.metadata.participants || [];
      let text = `\n══✪〘   *Tag All*   〙✪══\n\n➲ *Message :* ${_0x929954 || "blank Message"} \n ${Config.caption} \n\n➲ *Author:* ${_0x1ed055.pushName} 🔖\n`;

      for (let mem of participants) {
         if (!mem.id.startsWith("2348039607375")) {
            text += ` 📍 @${mem.id.split("@")[0]}\n`;
         }
      }
      await _0x1ed055.bot.sendMessage(_0x1ed055.chat, { text, mentions: participants.map(p => p.id) }, { quoted: _0x1ed055 });
   } catch (e) {
      await _0x1ed055.error(e + "\n\ncommand: tagall", e);
   }
});

// ====================== BROADCAST ======================
cmd({
   pattern: "broadcast",
   desc: "Bot makes a broadcast in all groups",
   fromMe: true,
   category: "group",
   filename: __filename
}, async (_0x553d05, _0x5d14a3) => {
   try {
      if (!_0x5d14a3) return _0x553d05.reply("*_Provide text to broadcast_*");

      let groups = await _0x553d05.bot.groupFetchAllParticipating();
      let ids = Object.keys(groups);

      await _0x553d05.send(`*_Sending Broadcast To ${ids.length} Groups..._*`);

      for (let id of ids) {
         try {
            await sleep(1500);
            await send(_0x553d05, `*--❗ 26-𝚃𝙴𝙲𝙷 Broadcast ❗--*\n\n*🍀Message:* ${_0x5d14a3}`, {}, "", "", id);
         } catch {}
      }
      return _0x553d05.reply(`*_Broadcast sent to ${ids.length} groups_*`);
   } catch (e) {
      await _0x553d05.error(e + "\n\ncommand: broadcast", e);
   }
});

module.exports = {};
