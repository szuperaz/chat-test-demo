"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { StreamChat, Channel, MessageResponse, Event } from "stream-chat";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY!;

interface ChatMessage {
  id: string;
  text: string;
  user: { id: string; name?: string };
  created_at: string;
  force_moderation: boolean;
}

function toMessage(msg: MessageResponse): ChatMessage {
  return {
    id: msg.id,
    text: msg.text || "",
    user: { id: msg.user?.id || "unknown", name: msg.user?.name },
    created_at: msg.created_at as string,
    force_moderation: true,
  };
}

export default function ChatPage() {
  const router = useRouter();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [newChannelUser, setNewChannelUser] = useState("");
  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize client
  useEffect(() => {
    const storedUserId = sessionStorage.getItem("stream_user_id");
    const storedName = sessionStorage.getItem("stream_user_name");
    const storedToken = sessionStorage.getItem("stream_token");

    if (!storedUserId || !storedToken || !storedName) {
      router.push("/");
      return;
    }

    setUserId(storedUserId);
    setUserName(storedName);

    const chatClient = new StreamChat(apiKey);

    let didCancel = false;

    const connect = async () => {
      try {
        await chatClient.connectUser(
          { id: storedUserId, name: storedName },
          storedToken
        );

        if (didCancel) return;
        setClient(chatClient);

        const userChannels = await chatClient.queryChannels(
          { members: { $in: [storedUserId] } },
          { last_message_at: -1 }
        );

        if (!didCancel) {
          setChannels(userChannels);
        }
      } catch (err) {
        if (!didCancel) {
          console.error("Failed to connect:", err);
        }
      }
    };

    connect();

    return () => {
      didCancel = true;
      chatClient.disconnectUser();
    };
  }, [router]);

  // Watch active channel for new messages
  useEffect(() => {
    if (!activeChannel) return;

    const loadMessages = async () => {
      const state = await activeChannel.watch();
      setMessages((state.messages || []).map(toMessage));
    };

    loadMessages();

    const handler = (event: Event) => {
      if (event.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === event.message!.id)) return prev;
          return [...prev, toMessage(event.message as MessageResponse)];
        });
      }
    };

    activeChannel.on("message.new", handler);

    return () => {
      activeChannel.off("message.new", handler);
    };
  }, [activeChannel]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChannel) return;
    await activeChannel.sendMessage({ text });
    setText("");
  };

  const startChat = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!client || !newChannelUser.trim()) return;

      const targetUserId = newChannelUser.toLowerCase().replace(/\s+/g, "-");

      // Ensure the target user exists on Stream before creating channel
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUserId, name: newChannelUser.trim() }),
      });

      if (!res.ok) {
        console.error("Failed to create target user");
        return;
      }

      // Create a distinct channel between the two users
      const channel = client.channel("messaging", {
        members: [userId, targetUserId],
      });

      await channel.watch();

      setChannels((prev) => {
        if (prev.some((c) => c.cid === channel.cid)) return prev;
        return [channel, ...prev];
      });
      setActiveChannel(channel);
      setNewChannelUser("");
    },
    [client, newChannelUser, userId]
  );

  const handleLogout = async () => {
    if (client) await client.disconnectUser();
    sessionStorage.clear();
    router.push("/");
  };

  if (!client) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <h1 className="text-lg font-semibold">Chat - {userName}</h1>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-gray-200 px-3 py-1 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
        >
          Sign Out
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex w-64 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          {/* New chat form */}
          <form
            onSubmit={startChat}
            className="border-b border-gray-200 p-3 dark:border-gray-700"
          >
            <p className="mb-2 text-xs font-medium text-gray-500 uppercase">
              Start new chat
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newChannelUser}
                onChange={(e) => setNewChannelUser(e.target.value)}
                placeholder="User name"
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700"
              />
              <button
                type="submit"
                disabled={!newChannelUser.trim()}
                className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </form>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto">
            {channels.map((ch) => {
              const otherMembers = Object.values(ch.state.members)
                .filter((m) => m.user_id !== userId)
                .map((m) => m.user?.name || m.user_id)
                .join(", ");

              return (
                <button
                  key={ch.cid}
                  onClick={() => setActiveChannel(ch)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    activeChannel?.cid === ch.cid
                      ? "bg-blue-50 font-medium text-blue-700 dark:bg-gray-700 dark:text-blue-400"
                      : ""
                  }`}
                >
                  {(ch.data as Record<string, unknown>)?.name as string || otherMembers || "Unnamed Channel"}
                </button>
              );
            })}
            {channels.length === 0 && (
              <p className="p-4 text-center text-sm text-gray-400">
                No conversations yet
              </p>
            )}
          </div>
        </aside>

        {/* Chat area */}
        <main className="flex flex-1 flex-col bg-white dark:bg-gray-900">
          {activeChannel ? (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((msg) => {
                  const isOwn = msg.user.id === userId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs rounded-xl px-4 py-2 text-sm ${
                          isOwn
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                        }`}
                      >
                        {!isOwn && (
                          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                            {msg.user.name || msg.user.id}
                          </p>
                        )}
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <form
                onSubmit={sendMessage}
                className="border-t border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
                  />
                  <button
                    type="submit"
                    disabled={!text.trim()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-gray-400">
                Select a conversation or start a new chat
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
