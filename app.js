require('dotenv').config();

// app.js

// importeer bolt
const { App } = require('@slack/bolt');
const port = process.env.PORT || 5000
// init
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,       // Token uit .env
  appToken: process.env.SLACK_APP_TOKEN,   // App-token uit .env
  socketMode: true,
});

// listener for /reactions 
app.command('/reactions', async ({ ack, body, client }) => {
    // acknowledge request
    await ack();
  
    try {
      const channelId = body.channel_id;
      const userId = body.user_id;
  
      // message link should be provided as the command argument
      const messageLink = body.text.trim();
  
      if (!messageLink) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: 'Please provide a message link after the /reactions command.',
        });
        return;
      }
  
      //heel bericht timestamp eruit(ts) 
      const tsMatch = messageLink.match(/\/p(\d{16})/);
      if (!tsMatch) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: 'Invalid message link. Please provide a valid Slack message link.',
        });
        return;
      }
  
      //converteer timestamp naar juiste formaat #typisch dat slack dit niet zelf kan
      const messageTs = `${parseInt(tsMatch[1].substring(0, 10))}.${tsMatch[1].substring(10)}`;
  
      // fetch
      const reactionsResult = await client.reactions.get({
        channel: channelId,
        timestamp: messageTs,
      });
  
      if (!reactionsResult.ok) {
        throw new Error('Failed to fetch reactions.');
      }
  
      const message = reactionsResult.message;
  
      //lijst van users die hebben gereageerd
      let reactedUserIds = [];
  
      if (message.reactions) {
        for (const reaction of message.reactions) {
          reactedUserIds = reactedUserIds.concat(reaction.users);
        }
        //dupl check
        reactedUserIds = [...new Set(reactedUserIds)];
      }
  
      if (reactedUserIds.length === 0) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: 'No one has reacted to the message yet.',
        });
        return;
      }
  
      // formateer lijst met @ das wel handig
      const reactedUsersMentions = reactedUserIds.map(id => `<@${id}>`).join(', ');
  
      // hidden message to the user who invoked the command
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `De volgende leden hebben al gereageerd:\n${reactedUsersMentions}`,
      });
  
    } catch (error) {
      console.error('Error in /reactions command:', error);
      await client.chat.postEphemeral({
        channel: body.channel_id,
        user: body.user_id,
        text: `An error occurred: ${error.message}`,
      });
    }
  });
  
  // Start app
  (async () => {
    await app.start();
    console.log('⚡️ Slack Bolt app is aan het draaien!');
  })();
