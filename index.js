const fs = require('fs');
const config = require('config');
const Discord = require('discord.js');
const SimpleVoiceState = require('./SimpleVoiceState');

const DEFAULT_NOTIFICATION_CHANNEL = 'Voice Notifications';

const botToken = config.get('botToken');
const client = new Discord.Client();

// each key is a guild, each guild is an object with channel IDs as keys,
// and each channel has an array of member IDs
let guildVoiceData = {};

// data matching IDs and display names of Guilds, Channels, and Members
let guildDisplayNames = {};
let channelDisplayNames = {};
let memberDisplayNames = {};

// notification text channel for each guild
let guildNotificationChannels = {};

// list of notified users for each guild
let guildNotifiedUsernames = {};

client.on('ready', () => {
  console.log(`Logged in as '${client.user.tag}'.`);
});

client.on('voiceStateUpdate', (oldState, newState) => {
  oldState = new SimpleVoiceState(oldState);
  newState = new SimpleVoiceState(newState);

  if (newState.isActive()) {
    const guildID = newState.getGuild().id;
    const channelID = newState.getChannel().id;
    const memberID = newState.getMember().id;
    const memberUsername = client.users.cache.get(memberID).username;

    updateNameData(newState);

    const channelBefore = getChannelData(guildID, channelID).copy();
    addMemberToChannel(guildID, channelID, memberID);
    const channelAfter = getChannelData(guildID, channelID).copy();

    if (hasJoinedChannel(memberID, channelBefore, channelAfter)) {
      const message = `'${memberDisplayNames[memberID]} has joined voice chat '${channelDisplayNames[channelID]}'.`;
      notifyUsernamesInChannel(message, guildID, { omittedUsername: memberUsername });
    }
  } else {
    const guildID = oldState.getGuild().id;
    const channelID = oldState.getChannel().id;
    const memberID = oldState.getMember().id;
    const memberUsername = client.users.cache.get(memberID).username;

    const channelBefore = getChannelData(guildID, channelID).copy();
    removeMemberFromChannel(guildID, channelID, memberID);
    const channelAfter = getChannelData(guildID, channelID).copy();

    if (hasLeftChannel(memberID, channelBefore, channelAfter)) {
      const message = `'${memberDisplayNames[memberID]} has left voice chat '${channelDisplayNames[channelID]}'.`;
      notifyUsernamesInChannel(message, guildID, { omittedUsername: memberUsername });
    }
  }
});

client.on('message', (msg) => {
  const msgContent = msg.content;

  const flag = '!whoison';

  if (msgContent.startsWith(flag)) {
    let text = '';
    Object.keys(guildVoiceData).forEach((key) => {
      const val = guildVoiceData[key];
      Object.keys(val).forEach((channelKey) => {
        const channelVal = val[channelKey];
        text += `Channel '${channelDisplayNames[channelKey]}' on Server '${guildDisplayNames[key]}' has: ${channelVal
          .map((e) => memberDisplayNames[e])
          .join(', ')}`;
        text += '\n\n';
      });
    });
    msg.reply(text);
  }
});

const notifyUsernamesInChannel = (message, guildID, options = {}) => {
  let notificationChannel = getNotificationChannel(guildID);

  if (notificationChannel === null) {
    notificationChannel = createAndGetNotificationChannel(guildID);
  }

  const notifiedUsernames = getNotifiedUsernames(guildID).copy();

  if (options.omittedUsername) {
    if (notifiedUsernames.contains(omittedUsername)) {
      notifiedUsernames.splice(notifiedUsernames.indexOf(omittedUsername), 1);
    }
  }

  let messageUsernamesPrefix = notifiedUsernames.map((e) => `@${e}`).join(' ');

  let fullMessage = messageUsernamesPrefix + message;

  notificationChannel.send(fullMessage);
};

const createAndGetNotificationChannel = async (guildID) => {
  const guild = client.guilds.cache.get(guildID);
  if (guild) {
    const notificationChannel = await guild.channels.create('VC Notifications', { reason: 'Automatically generated by VC Notifier bot' });
    const notificationChannelID = notificationChannel.id;

    guildNotificationChannels[guildID] = notificationChannelID;

    return getNotificationChannel(guildID);
  } else {
    throw new Error(`Guild with ID '${guildID}' does not exist`);
  }
};

const getNotificationChannel = (guildID) => {
  const notificationChannelID = guildNotificationChannels[guildID];
  if (notificationChannelID) {
    const notificationChannel = client.channels.cache.get(notificationChannelID);
    if (notificationChannel) {
      return notificationChannel;
    }
  }
  return null;
};

const getNotifiedUsernames = (guildID) => {
  const notifiedUsernames = guildNotifiedUsernames[guildID];
  if (notifiedUsernames) {
    return notifiedUsernames;
  }
  return [];
};

const addMemberToChannel = (guildID, channelID, memberID) => {
  // if member is being added to a channel, they can't be in any other channels as well
  // As of 2020/06/09, Discord prohibits users from joining multiple voice channels at once
  removeMemberFromAllChannelsInGuild(guildID, memberID);

  targetChannel = getChannelData(guildID, channelID);

  if (!targetChannel.contains(memberID)) {
    targetChannel.push(memberID);
  }
};

const removeMemberFromChannel = (guildID, channelID, memberID) => {
  targetChannel = getChannelData(guildID, channelID);

  if (targetChannel.contains(memberID)) {
    targetChannel.splice(targetChannel.indexOf(memberID), 1);
  }
};

const removeMemberFromAllChannelsInGuild = (guildID, memberID) => {
  const targetGuild = guildVoiceData[guildID];
  if (targetGuild) {
    const targetGuild = guildVoiceData[guildID];
    Object.keys(targetGuild).forEach((channelID) => {
      const channelMembers = targetGuild[channelID];

      // remove all occurrences of member in channel
      let memberInChannel = true;
      while (memberInChannel) {
        if (channelMembers.contains(memberID)) {
          memberInChannel = true;
          channelMembers.splice(channelMembers.indexOf(memberID), 1);
        } else {
          memberInChannel = false;
        }
      }
    });
  }
};

const getChannelData = (guildID, channelID) => {
  let targetGuild = guildVoiceData[guildID];

  if (!targetGuild) {
    guildVoiceData[guildID] = {};
  }

  let targetChannel = guildVoiceData[guildID][channelID];

  if (!targetChannel) {
    guildVoiceData[guildID][channelID] = [];
  }

  return guildVoiceData[guildID][channelID];
};

const updateNameData = (simpleVoiceStateObj) => {
  guild = simpleVoiceStateObj.getGuild();
  channel = simpleVoiceStateObj.getChannel();
  member = simpleVoiceStateObj.getMember();

  updateGuildDisplayName(guild.id, guild.displayName);
  updateChannelDisplayName(channel.id, channel.displayName);
  updateMemberDisplayName(member.id, member.displayName);
};

const updateGuildDisplayName = (guildID, guildDisplayName) => {
  guildDisplayNames[guildID] = guildDisplayName;
};
const updateChannelDisplayName = (channelID, channelDisplayName) => {
  channelDisplayNames[channelID] = channelDisplayName;
};
const updateMemberDisplayName = (memberID, memberDisplayName) => {
  memberDisplayNames[memberID] = memberDisplayName;
};

Array.prototype.contains = function (elm) {
  return this.indexOf(elm) > -1;
};
Object.prototype.copy = function () {
  return JSON.parse(JSON.stringify(this));
};

client.login(botToken);