import { StreamChat } from "stream-chat";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId, name } = await req.json();

  if (!userId || !name) {
    return NextResponse.json(
      { error: "userId and name are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;
  const apiSecret = process.env.STREAM_API_SECRET!;

  const serverClient = new StreamChat(apiKey, apiSecret);

  await serverClient.upsertUser({
    id: userId,
    name,
    role: "user",
  });

  const token = serverClient.createToken(userId);

  return NextResponse.json({ token, userId, name });
}
