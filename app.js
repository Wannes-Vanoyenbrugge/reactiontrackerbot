require('dotenv').config();

// app.js

// importeer Bolt
const { App } = require('@slack/bolt');
const port = process.env.PORT || 5000;

// initialiseer de app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,       // token uit .env
  appToken: process.env.SLACK_APP_TOKEN,    // app-token uit .env
  socketMode: true,
});

// definieer het monitoringkanaal-ID
const monitoringChannelId = 'C082R3BL8AD'; // vervang door het werkelijke kanaal-ID

// luisteraar voor /reactions-commando
app.command('/reactions', async ({ ack, body, client }) => {
  // bevestig de aanvraag
  await ack();

  try {
    const channelId = body.channel_id;
    const userId = body.user_id;

    // berichtlink moet worden opgegeven als argument van het commando
    const messageLink = body.text.trim();

    if (!messageLink) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Geef een berichtlink na de /reactions command.',
      });
      return;
    }

    // haal timestamp uit de link
    const tsMatch = messageLink.match(/\/p(\d{16})/);
    if (!tsMatch) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Dit is geen geldige Slack-berichtlink.',
      });
      return;
    }

    // converteer timestamp naar het juiste formaat
    const messageTs = `${parseInt(tsMatch[1].substring(0, 10))}.${tsMatch[1].substring(10)}`;

    // haal het originele bericht op
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

    // haal alle reacties op
    const reactionsResult = await client.reactions.get({
      channel: channelId,
      timestamp: messageTs,
    });

    if (!reactionsResult.ok) {
      throw new Error('Kon de reacties niet ophalen.');
    }

    const message = reactionsResult.message;

    // haal alle gebruikers op die hebben gereageerd
    let reactedUserIds = [];
    if (message.reactions) {
      for (const reaction of message.reactions) {
        reactedUserIds = reactedUserIds.concat(reaction.users);
      }
      reactedUserIds = [...new Set(reactedUserIds)]; // verwijder duplicaten
    }

    // haal alle leden van het kanaal op
    const membersResult = await client.conversations.members({ channel: channelId });
    if (!membersResult.ok) {
      throw new Error('Kon de kanaalleden niet ophalen.');
    }

    const allMemberIds = membersResult.members;

    // bereken gebruikers die nog niet hebben gereageerd
    const nonReactedUserIds = allMemberIds.filter(id => !reactedUserIds.includes(id));

    if (nonReactedUserIds.length === 0) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Iedereen in het kanaal heeft gereageerd op het bericht.',
      });
      return;
    }

    // sluit specifieke gebruikers-ID's uit (bijv. bots of specifieke gebruikers)
    const excludedUserIds = ['U07SLH9JS1K', 'U07UAFE83LH', 'U0828C7UFG9']; // vervang door werkelijke ID's

    // filter bots of specifieke gebruikersgroepen eruit
    const nonReactedUserIdsFiltered = nonReactedUserIds.filter(
      id => !excludedUserIds.includes(id)
    );

    // bereken statistieken
    const reactedCount = reactedUserIds.length;
    const nonReactedCount = nonReactedUserIdsFiltered.length;
    const totalMembers = allMemberIds.length - excludedUserIds.length;

    // stuur een DM naar elke niet-reageerder
    for (const userId of nonReactedUserIdsFiltered) {
      try {
        // open een gesprek met de gebruiker
        const imResult = await client.conversations.open({ users: userId });
        const imChannelId = imResult.channel.id;

        // stuur een bericht naar de gebruiker
        await client.chat.postMessage({
          channel: imChannelId,
          text: `Hallo! Dit is een vriendelijke herinnering om te reageren op het volgende bericht:\n> ${messageText}\n\nJe kunt hier reageren: ${messageLink}`,
        });
      } catch (error) {
        console.error(`Fout bij het versturen van DM naar gebruiker ${userId}:`, error);
      }
    }

    // haal gebruikersinformatie op en formatteer de namenlijst
    const nonReactedUserNames = [];
    for (const userId of nonReactedUserIdsFiltered) {
      try {
        const userInfo = await client.users.info({ user: userId });
        nonReactedUserNames.push(userInfo.user.real_name || userInfo.user.name);
      } catch (error) {
        console.error(`Fout bij het ophalen van gebruikersinformatie voor ${userId}:`, error);
      }
    }

    // maak een lijst van namen
    const nonReactedUserNamesList = nonReactedUserNames.join(', ');

    // stuur de lijst met niet-reageerders naar het monitoringkanaal
        // bouw het bericht met Block Kit
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📊 Reactie Overzicht voor HR/Analytics',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Bericht:*\n>${messageText}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Leden die nog niet hebben gereageerd (${nonReactedCount}):*\n${nonReactedUserNamesList}`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `:large_green_circle: *Gereageerd:* ${reactedCount} | :red_circle: *Niet gereageerd:* ${nonReactedCount}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Bekijk het originele bericht',
              emoji: true,
            },
            url: messageLink,
            action_id: 'view_original_message',
          },
        ],
      },
    ];

    // stuur het bericht met blocks naar het monitoringkanaal
    await client.chat.postMessage({
      channel: monitoringChannelId,
      text: 'Reactie Overzicht voor HR/Analytics',
      blocks: blocks,
    });


  } catch (error) {
    console.error('Fout in /reactions-commando:', error);
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `Er is een fout opgetreden: ${error.message}`,
    });
  }
});

// start de app
(async () => {
  await app.start();
  console.log('⚡️ Slack reaction tracker is aan het draaien!');
})();
