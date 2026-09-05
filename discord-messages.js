export async function onRequest(context) {
  const CHANNEL_IDS = [
    "1526119492370042951",
    "1526119523412082738",
    "1514457920161447956",
    "1514457946111868948",
    "1514457969280946277",
  ];

  const BOT_TOKEN = context.env.DISCORD_BOT_TOKEN;
  const MAX_MESSAGES = 5;

  if (!BOT_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing BOT_TOKEN" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const results = await Promise.all(
      CHANNEL_IDS.map(async (channelId) => {
        const res = await fetch(
          `https://discord.com/api/v10/channels/${channelId}/messages?limit=3`,
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
        if (!res.ok) throw new Error(`Channel ${channelId} error: ${res.status}`);
        return await res.json();
      })
    );

    const priority1Messages = results[0] || [];
    const priority2Messages = results[1] || [];
    const otherMessages = results.slice(2).flat();

    const sortedP1 = priority1Messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sortedP2 = priority2Messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sortedOthers = otherMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let combined = [];
    const usedIds = new Set();

    if (sortedP1.length > 0) {
      combined.push(sortedP1[0]);
      usedIds.add(sortedP1[0].id);
    }

    if (sortedP2.length > 0 && !usedIds.has(sortedP2[0].id)) {
      combined.push(sortedP2[0]);
      usedIds.add(sortedP2[0].id);
    }

    const allRemaining = [...sortedP1.slice(1), ...sortedP2.slice(1), ...sortedOthers]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    for (const msg of allRemaining) {
      if (combined.length >= MAX_MESSAGES) break;
      if (!usedIds.has(msg.id)) {
        combined.push(msg);
        usedIds.add(msg.id);
      }
    }

    const formatted = combined.map(msg => ({
      author: msg.author.global_name || msg.author.username,
      content: msg.content || "(embed or attachment)",
      timestamp: msg.timestamp
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
