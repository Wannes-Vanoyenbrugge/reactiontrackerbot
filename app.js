require('dotenv').config();

// app.js

// importeer bolt
const { App } = require('@slack/bolt');
const port = process.env.PORT || 5000;
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
        text: 'Geef een berichtlink na de /reactions command.',
      });
      return;
    }

    // Haal timestamp uit de link
    const tsMatch = messageLink.match(/\/p(\d{16})/);
    if (!tsMatch) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Dit is geen slack message link.',
      });
      return;
    }

    // Converteer timestamp naar het juiste formaat
    const messageTs = `${parseInt(tsMatch[1].substring(0, 10))}.${tsMatch[1].substring(10)}`;

    // Haal het originele bericht op
    const messageResult = await client.conversations.history({
      channel: channelId,
      latest: messageTs,
      inclusive: true,
      limit: 1,
    });

    if (!messageResult.ok || !messageResult.messages || messageResult.messages.length === 0) {
      throw new Error('Kon het originele bericht niet ophalen.');
    }

    const originalMessage = messageResult.messages[0];
    const messageText = originalMessage.text || '[Geen tekst beschikbaar]';

    // Haal alle reacties op
    const reactionsResult = await client.reactions.get({
      channel: channelId,
      timestamp: messageTs,
    });

    if (!reactionsResult.ok) {
      throw new Error('Lukte niet om de reactions op te halen.');
    }

    const message = reactionsResult.message;

    // Haal alle gebruikers op die hebben gereageerd
    let reactedUserIds = [];
    if (message.reactions) {
      for (const reaction of message.reactions) {
        reactedUserIds = reactedUserIds.concat(reaction.users);
      }
      reactedUserIds = [...new Set(reactedUserIds)]; // Verwijder duplicaten
    }

    // Haal alle leden van het kanaal op
    const membersResult = await client.conversations.members({ channel: channelId });
    if (!membersResult.ok) {
      throw new Error('Lukte niet om de kanaalleden te bekijken.');
    }

    const allMemberIds = membersResult.members;

    // Bereken de gebruikers die nog niet hebben gereageerd
    const nonReactedUserIds = allMemberIds.filter(id => !reactedUserIds.includes(id));

    if (nonReactedUserIds.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Iedereen in het kanaal heeft gereageerd op het bericht.',
      });
      return;
    }

    // Achterhaal deze IDs en voeg ze hier toe
    const excludedUserIds = ['U07SLH9JS1K', 'U07UAFE83LH', 'U0828C7UFG9']; // Vervang door echte IDs van bots of specifieke gebruikers

    // Filter bots of specifieke gebruikersgroepen
    const nonReactedUserIdsFiltered = nonReactedUserIds.filter(
      id => !excludedUserIds.includes(id) // Filter specifieke gebruikers
    );

    // Formatteer de lijst met @ voor mentions
    const nonReactedUsersMentions = nonReactedUserIdsFiltered.map(id => `<@${id}>`).join(', ');

    // Bereken statistieken
    const reactedCount = reactedUserIds.length;
    const nonReactedCount = nonReactedUserIdsFiltered.length; // Gebruik de gefilterde lijst
    const totalMembers = allMemberIds.length - 3;

    // Stuur een publiek bericht naar het kanaal
    await client.chat.postMessage({
      channel: channelId,
      text: `🚨 De volgende AFC leden hebben nog niet gereageerd op onderstaand bericht:\n> ${messageText}\n\n${nonReactedUsersMentions}\n\n📊 Status: ${reactedCount} van de ${totalMembers} leden hebben gereageerd (${nonReactedCount} niet). Gelieve dit snel in orde te brengen - Team HR/Analytics.`,
      attachments: [
        {
          text: 'Reageer direct:',
          fallback: 'Je kunt hier niet reageren.',
          actions: [
            {
              type: 'button',
              text: 'Ga naar bericht',
              url: messageLink, // Directe link naar het originele bericht
            },
          ],
        },
      ],
    });

  } catch (error) {
    console.error('Error in /reactions command:', error);
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `Er is een fout opgetreden: ${error.message}`,
    });
  }
});

// Start app
(async () => {
  await app.start();
  console.log('⚡️ Slack reaction tracker is aan het draaien!');
})();
