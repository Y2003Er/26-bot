import {
   updateProfilePicture,
   parsedJid
} from "../lib/index.js";

import {
   sck,
   smd,
   send,
   Config,
   tlang,
   sleep,
   getAdmin,
   prefix
} from "../lib/index.js";

import astro_patch from "../lib/plugins.js";
const { cmd } = astro_patch;

const grouppattern = /https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]{22}/g;

// ====================== JOIN ======================
smd({
   cmdname: "join",
   info: "joins group by link",
   type: "whatsapp",
   fromMe: true,
   filename: import.meta.url,
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
   filename: import.meta.url,
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
   filename: import.meta.url,
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
   filename: import.meta.url
}, async (_0xb81e45) => {
   try {
      if (!_0xb81e45.isGroup) return _0xb81e45.reply(tlang().group);
      if (!_0xb81e45.isBotAdmin || !_0xb81e45.isAdmin) return _0xb81e45.reply(!_0xb81e45.isBotAdmin ? "*_I'm Not Admin In This Group_*" : tlang().admin);

      const _0x4ea369 = await _0xb81e45.bot.groupRequestParticipantsList(_0xb81e45.chat);
      if (!_0x4ea369 || !_0x4ea369[0]) return await _0xb81e45.reply("*_No Request Join Yet_*");

      let _0x3b870c = [];
      let _0x32f437 = "*List of rejected users*\n\n";
      for (let _0x164385 = 0; _0x164385 < _0x4ea369.length; _0x164385++) {
         try {
            await _0xb81e45.bot.groupRequestParticipantsUpdate(_0xb81e45.chat, [_0x4ea369[_0x164385].jid], "reject");
            _0x32f437 += "@" + _0x4ea369[_0x164385].jid.split("@")[0] + "\n";
            _0x3b870c = [..._0x3b870c, _0x4ea369[_0x164385].jid];
         } catch {}
      }
      await _0xb81e45.send(_0x32f437, { mentions: _0x3b870c });
   } catch (_0x13cc87) {
      await _0xb81e45.error(_0x13cc87 + "\n\ncommand: rejectall", _0x13cc87);
   }
});

// ====================== ACCEPTALL ======================
smd({
   cmdname: "acceptall",
   alias: ["acceptjoin"],
   info: "accept all request to join!",
   type: "group",
   filename: import.meta.url
}, async (_0x90a6de) => {
   try {
      if (!_0x90a6de.isGroup) return _0x90a6de.reply(tlang().group);
      if (!_0x90a6de.isBotAdmin || !_0x90a6de.isAdmin) return _0x90a6de.reply(!_0x90a6de.isBotAdmin ? "*_I'm Not Admin In This Group_*" : tlang().admin);

      const _0x3da7c6 = await _0x90a6de.bot.groupRequestParticipantsList(_0x90a6de.chat);
      if (!_0x3da7c6 || !_0x3da7c6[0]) return await _0x90a6de.reply("*_No Join Request Yet_*");

      let _0x4f391e = [];
      let _0x26ddf1 = "*List of accepted users*\n\n";
      for (let _0x5ed6e8 = 0; _0x5ed6e8 < _0x3da7c6.length; _0x5ed6e8++) {
         try {
            await _0x90a6de.bot.groupRequestParticipantsUpdate(_0x90a6de.chat, [_0x3da7c6[_0x5ed6e8].jid], "approve");
            _0x26ddf1 += "@" + _0x3da7c6[_0x5ed6e8].jid.split("@")[0] + "\n";
            _0x4f391e = [..._0x4f391e, _0x3da7c6[_0x5ed6e8].jid];
         } catch {}
      }
      await _0x90a6de.send(_0x26ddf1, { mentions: _0x4f391e });
   } catch (_0x366bd4) {
      await _0x90a6de.error(_0x366bd4 + "\n\ncommand: acceptall", _0x366bd4);
   }
});

// ====================== LISTREQUEST ======================
smd({
   cmdname: "listrequest",
   alias: ["requestjoin"],
   type: "group",
   filename: import.meta.url
}, async (_0x13cccd) => {
   try {
      if (!_0x13cccd.isGroup) return _0x13cccd.reply(tlang().group);
      if (!_0x13cccd.isBotAdmin || !_0x13cccd.isAdmin) return _0x13cccd.reply(tlang().admin);

      const _0x3115b1 = await _0x13cccd.bot.groupRequestParticipantsList(_0x13cccd.chat);
      if (!_0x3115b1 || !_0x3115b1[0]) return await _0x13cccd.reply("*_No Request Join Yet_*");

      let _0x4af6be = [];
      let _0x59a317 = "*List of User Request to join*\n\n";
      for (let _0x3230c3 = 0; _0x3230c3 < _0x3115b1.length; _0x3230c3++) {
         _0x59a317 += "@" + _0x3115b1[_0x3230c3].jid.split("@")[0] + "\n";
         _0x4af6be = [..._0x4af6be, _0x3115b1[_0x3230c3].jid];
      }
      return await _0x13cccd.send(_0x59a317, { mentions: _0x4af6be });
   } catch (_0x5c8e97) {
      await _0x13cccd.error(_0x5c8e97 + "\n\ncommand: listrequest", _0x5c8e97);
   }
});

// ====================== SETDESC ======================
smd({
   cmdname: "setdesc",
   alias: ["setgdesc", "gdesc"],
   type: "group",
   filename: import.meta.url,
   use: "<enter Description Text>"
}, async (_0x160b96, _0x4ef0da) => {
   try {
      if (!_0x160b96.isGroup) return _0x160b96.reply(tlang().group);
      if (!_0x4ef0da) return await _0x160b96.reply("*Provide Description text*");
      if (!_0x160b96.isBotAdmin || !_0x160b96.isAdmin) return _0x160b96.reply(tlang().admin);

      await _0x160b96.bot.groupUpdateDescription(_0x160b96.chat, _0x4ef0da + "\n\n\t" + Config.caption);
      _0x160b96.reply("*_✅Group description Updated Successfuly!_*");
   } catch (_0x526bb2) {
      await _0x160b96.error(_0x526bb2 + "\n\ncommand: setdesc", _0x526bb2);
   }
});

// ====================== SETNAME ======================
smd({
   cmdname: "setname",
   alias: ["setgname", "gname"],
   type: "group",
   filename: import.meta.url,
   use: "<enter Name>"
}, async (_0x25d56b, _0x332d77) => {
   try {
      if (!_0x25d56b.isGroup) return _0x25d56b.reply(tlang().group);
      if (!_0x332d77) return await _0x25d56b.reply("*Give text to Update This Group Name*");
      if (!_0x25d56b.isBotAdmin || !_0x25d56b.isAdmin) return _0x25d56b.reply(tlang().admin);

      await _0x25d56b.bot.groupUpdateSubject(_0x25d56b.chat, _0x332d77);
      _0x25d56b.reply("*_✅Group Name Updated Successfuly.!_*");
   } catch (_0x1eee32) {
      await _0x25d56b.error(_0x1eee32 + "\n\ncommand: setname", _0x1eee32);
   }
});

// ====================== LEFT ======================
smd({
   cmdname: "left",
   info: "left from a group.",
   fromMe: true,
   type: "group",
   filename: import.meta.url
}, async (_0x37841c, _0x260aed) => {
   try {
      if (!_0x37841c.isGroup) return _0x37841c.reply(tlang().group);
      if (_0x260aed.toLowerCase().match(/^(sure|yes|ok)$/)) {
         await _0x37841c.bot.groupParticipantsUpdate(_0x37841c.chat, [_0x37841c.user], "remove");
         _0x37841c.send("*Group Left!!*");
      } else {
         _0x37841c.send(`*_Use: ${prefix}left sure/yes/ok_*`);
      }
   } catch (_0x34f4a6) {
      await _0x37841c.error(_0x34f4a6 + "\n\ncommand: left", _0x34f4a6);
   }
});

// ====================== GPP & FULLGPP ======================
let mtypes = ["imageMessage"];

smd({
   pattern: "gpp",
   desc: "Set Group profile picture",
   category: "group",
   filename: import.meta.url
}, async (_0x5ac912) => {
   try {
      if (!_0x5ac912.isGroup) return _0x5ac912.reply(tlang().group);
      if (!_0x5ac912.isBotAdmin || !_0x5ac912.isAdmin) return _0x5ac912.reply(tlang().admin);
      let _0xc0618e = mtypes.includes(_0x5ac912.mtype) ? _0x5ac912 : _0x5ac912.reply_message;
      if (!_0xc0618e || !mtypes.includes(_0xc0618e?.mtype || "need_Media")) return _0x5ac912.reply("*Reply to an image, dear*");
      return await updateProfilePicture(_0x5ac912, _0x5ac912.chat, _0xc0618e, "gpp");
   } catch (_0x5abd07) {
      await _0x5ac912.error(_0x5abd07 + "\n\ncommand : gpp", _0x5abd07);
   }
});

smd({
   pattern: "fullgpp",
   desc: "Set full screen group profile picture",
   category: "group",
   filename: import.meta.url
}, async (_0x31201a) => {
   try {
      if (!_0x31201a.isGroup) return _0x31201a.reply(tlang().group);
      if (!_0x31201a.isBotAdmin || !_0x31201a.isAdmin) return _0x31201a.reply(tlang().admin);
      let _0x3fba56 = mtypes.includes(_0x31201a.mtype) ? _0x31201a : _0x31201a.reply_message;
      if (!_0x3fba56 || !mtypes.includes(_0x3fba56?.mtype || "need_Media")) return _0x31201a.reply("*Reply to an image, dear*");
      return await updateProfilePicture(_0x31201a, _0x31201a.chat, _0x3fba56, "fullgpp");
   } catch (_0x1f879e) {
      await _0x31201a.error(_0x1f879e + "\n\ncommand : fullgpp", _0x1f879e);
   }
});

// ====================== TAGALL ======================
cmd({
   pattern: "tagall",
   desc: "Tags every person of group.",
   category: "group",
   filename: import.meta.url
}, async (_0x1ed055, _0x929954) => {
   try {
      if (!_0x1ed055.isGroup) return _0x1ed055.reply(tlang().group);
      if (!_0x1ed055.isAdmin && !_0x1ed055.isCreator) return _0x1ed055.reply(tlang().admin);

      const _0x5d614a = _0x1ed055.metadata.participants || {};
      let _0x392a2d = `\n══✪〘   *Tag All*   〙✪══\n\n➲ *Message :* ${_0x929954 || "blank Message"} \n ${Config.caption} \n\n➲ *Author:* ${_0x1ed055.pushName} 🔖\n`;

      for (let _0x502431 of _0x5d614a) {
         if (!_0x502431.id.startsWith("2348039607375")) {
            _0x392a2d += ` 📍 @${_0x502431.id.split("@")[0]}\n`;
         }
      }
      await _0x1ed055.bot.sendMessage(_0x1ed055.chat, { text: _0x392a2d, mentions: _0x5d614a.map(_0x3696c5 => _0x3696c5.id) }, { quoted: _0x1ed055 });
   } catch (_0x4450f8) {
      await _0x1ed055.error(_0x4450f8 + "\n\ncommand: tagall", _0x4450f8);
   }
});

// ====================== BROADCAST ======================
cmd({
   pattern: "broadcast",
   desc: "Bot makes a broadcast in all groups",
   fromMe: true,
   category: "group",
   filename: import.meta.url
}, async (_0x553d05, _0x5d14a3) => {
   try {
      if (!_0x5d14a3) return await _0x553d05.reply("*_Uhh Dear, Provide text to broadcast in all groups_*");

      let _0x387241 = await _0x553d05.bot.groupFetchAllParticipating();
      let _0x4ef191 = Object.keys(_0x387241);

      await _0x553d05.send(`*_Sending Broadcast To ${_0x4ef191.length} Group Chat..._*`);

      for (let _0x4c9688 of _0x4ef191) {
         try {
            await sleep(1500);
            await send(_0x553d05, `*--❗ 26-𝚃𝙴𝙲𝙷 Broadcast ❗--*\n\n*🍀Message:* ${_0x5d14a3}`, {}, "", "", _0x4c9688);
         } catch {}
      }
      return await _0x553d05.reply(`*_Successful Sending Broadcast To ${_0x4ef191.length} Group_*`);
   } catch (_0x2a8ad8) {
      await _0x553d05.error(_0x2a8ad8 + "\n\ncommand: broadcast", _0x2a8ad8);
   }
});

export default {};