import { StreamChat } from "stream-chat";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;
if (!apiKey || !apiSecret) {
  console.error("Missing NEXT_PUBLIC_STREAM_API_KEY or STREAM_API_SECRET in .env.local");
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { messages: 100, users: 10, channel: "bench-test" };
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--messages" || args[i] === "-m") && args[i + 1]) {
      opts.messages = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--users" || args[i] === "-u") && args[i + 1]) {
      opts.users = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === "--channel" || args[i] === "-c") && args[i + 1]) {
      opts.channel = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`Usage: npm run bench -- [options]

Options:
  -m, --messages <n>   Number of messages to send (default: 100)
  -u, --users <n>      Number of random users (default: 10)
  -c, --channel <id>   Channel ID to send to (default: bench-test)
  -h, --help           Show this help`);
      process.exit(0);
    }
  }
  return opts;
}

const CLEAN_PHRASES = [
  "Hey, how's it going?",
  "Just checking in!",
  "Anyone around?",
  "What do you think about this?",
  "Sounds good to me",
  "Let me know when you're free",
  "I'll take a look at it",
  "Can we discuss this later?",
  "Thanks for the update!",
  "Got it, will do",
  "Makes sense",
  "I'm on it",
  "Quick question about the project",
  "Sure, let's do it",
  "No worries at all",
  "That's a great idea!",
  "Everything looks good so far",
  "Happy to help with that",
  "What's the deadline?",
  "Just finished the task",
  "This should be fixed now",
  "Awesome, thanks!",
];

const TOXIC_PHRASES = [
  "You're such an idiot, nobody likes you",
  "Shut the hell up you moron",
  "I swear I'm going to kill this project and everyone on it",
  "You're completely useless, just quit already",
  "What a stupid idea, are you brain dead?",
  "Go to hell, I don't care what you think",
  "You're the worst person I've ever worked with, absolute trash",
  "I hate every single one of you, bunch of losers",
  "Screw you and your garbage opinions",
  "You're a worthless piece of crap, do us a favor and leave",
  "Nobody asked for your dumb opinion, shut up",
  "This team is full of incompetent fools",
  "I'll make your life miserable if you don't back off",
  "You disgust me, get out of my face",
  "Die in a fire, this code is absolute garbage",
];

const PHRASES = [...CLEAN_PHRASES, ...TOXIC_PHRASES];

const FIRST_NAMES = [
  "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace",
  "Hank", "Ivy", "Jack", "Kara", "Leo", "Mia", "Noah", "Olga",
  "Paul", "Quinn", "Rosa", "Sam", "Tina", "Uma", "Vic", "Wendy",
  "Xena", "Yuri", "Zara",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const opts = parseArgs();
  console.log(`\nBench config: ${opts.messages} messages, ${opts.users} users, channel "${opts.channel}"\n`);

  // Server client — only used for provisioning users, tokens, and the channel
  const serverClient = new StreamChat(apiKey, apiSecret);

  const users = Array.from({ length: opts.users }, (_, i) => {
    const name = pick(FIRST_NAMES) + (i > 0 ? ` ${i}` : "");
    const id = `bench-${name.toLowerCase().replace(/\s+/g, "-")}`;
    return { id, name };
  });
  const uniqueUsers = [...new Map(users.map((u) => [u.id, u])).values()];

  console.log(`Creating ${uniqueUsers.length} users...`);
  await serverClient.upsertUsers(uniqueUsers.map((u) => ({ id: u.id, name: u.name, role: "user" })));

  const tokens = new Map();
  for (const u of uniqueUsers) {
    tokens.set(u.id, serverClient.createToken(u.id));
  }

  // Create the channel via server client
  const serverChannel = serverClient.channel("messaging", opts.channel, {
    name: `Bench ${opts.channel}`,
    members: uniqueUsers.map((u) => u.id),
    created_by_id: uniqueUsers[0].id,
  });
  await serverChannel.create();
  await serverChannel.addMembers(uniqueUsers.map((u) => u.id));
  console.log(`Channel "${opts.channel}" ready with ${uniqueUsers.length} members`);

  // Connect every user as a client-side instance
  console.log(`Connecting ${uniqueUsers.length} client-side users...`);
  const clients = new Map();

  for (const u of uniqueUsers) {
    const c = new StreamChat(apiKey, { allowServerSideConnect: true });
    await c.connectUser({ id: u.id, name: u.name }, tokens.get(u.id));
    const ch = c.channel("messaging", opts.channel);
    await ch.watch();
    clients.set(u.id, { client: c, channel: ch });
  }
  console.log(`All users connected\n`);

  // Send messages client-side
  const start = Date.now();
  let sent = 0;
  const errors = [];

  for (let i = 0; i < opts.messages; i++) {
    const user = pick(uniqueUsers);
    const text = pick(PHRASES);
    try {
      const { channel } = clients.get(user.id);
      await channel.sendMessage({ text });
      sent++;
    } catch (err) {
      errors.push({ i, user: user.id, error: err.message });
    }

    if ((i + 1) % 10 === 0 || i + 1 === opts.messages) {
      const pct = Math.round(((i + 1) / opts.messages) * 100);
      process.stdout.write(`\r  Sent ${i + 1}/${opts.messages} (${pct}%)`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n\nDone! ${sent} messages sent in ${elapsed}s (${(sent / elapsed).toFixed(1)} msg/s)`);
  if (errors.length > 0) {
    console.log(`${errors.length} errors:`);
    errors.slice(0, 5).forEach((e) => console.log(`  msg #${e.i}: ${e.error}`));
    if (errors.length > 5) console.log(`  ... and ${errors.length - 5} more`);
  }

  // Disconnect all clients
  console.log("\nDisconnecting users...");
  for (const { client } of clients.values()) {
    await client.disconnectUser();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
