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
  const opts = { channel: null, creator: null, member: null, name: null };
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--channel" || args[i] === "-c") && args[i + 1]) {
      opts.channel = args[i + 1];
      i++;
    } else if ((args[i] === "--creator") && args[i + 1]) {
      opts.creator = args[i + 1];
      i++;
    } else if ((args[i] === "--member") && args[i + 1]) {
      opts.member = args[i + 1];
      i++;
    } else if ((args[i] === "--name" || args[i] === "-n") && args[i + 1]) {
      opts.name = args[i + 1];
      i++;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`Usage: npm run create-channel -- [options]

Options:
  --creator <name>      User who creates/owns the channel (required)
  --member <name>       User to add as a member (required)
  -c, --channel <id>    Channel ID (required)
  -n, --name <name>     Channel display name (defaults to channel ID)
  -h, --help            Show this help`);
      process.exit(0);
    }
  }
  if (!opts.channel || !opts.creator || !opts.member) {
    console.error("Error: --channel, --creator, and --member are required. Use --help for usage.");
    process.exit(1);
  }
  opts.name = opts.name || opts.channel;
  return opts;
}

async function main() {
  const opts = parseArgs();

  const client = new StreamChat(apiKey, apiSecret);

  const creatorId = opts.creator.toLowerCase().replace(/\s+/g, "-");
  const memberId = opts.member.toLowerCase().replace(/\s+/g, "-");

  await client.upsertUsers([
    { id: creatorId, name: opts.creator, role: "user" },
    { id: memberId, name: opts.member, role: "user" },
  ]);
  console.log(`Users ready: creator="${creatorId}", member="${memberId}"`);

  const channel = client.channel("messaging", opts.channel, {
    name: opts.name,
    members: [creatorId, memberId],
    created_by_id: creatorId,
  });
  await channel.create();

  console.log(`Channel "${opts.channel}" created by "${creatorId}" with member "${memberId}"`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
