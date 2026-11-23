"use client";

// TEMPORARY visual-check harness. Delete after use.

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ConversationList } from "@/components/inbox/conversation-list";
import { MessageThread } from "@/components/inbox/message-thread";
import type { Conversation, Message } from "@/types";

const now = Date.now();
const iso = (m: number) => new Date(now - m * 60_000).toISOString();
const rows: [string, string, number, number][] = [
  ["Dessy", "Ma'am, could you please confirm when you placed the order?", 5, 0],
  ["Deeps", "Ma'am, please give us some time to check this with the team", 16, 2],
  ["VK", "📚 *Class 1 to 4 Belesu Guidebooks:* 🔷 *Class 1…", 60 * 24, 0],
  ["Charchika", "Hello", 60 * 25, 0],
  ["~megha~", "📚 *Class 5 & 6 Belesu Guidebooks:*", 60 * 72, 0],
  ["Neha Shah", "Call me back", 60 * 73, 0],
];
const conversations = rows.map(([name, text, ago, unread], i) => ({
  id: `c${i}`, contact_id: `k${i}`, status: "open", unread_count: unread,
  last_message_at: iso(ago), updated_at: iso(ago), last_message_text: text,
  contact: { id: `k${i}`, name, phone: "+91 98450 1122" + i },
})) as unknown as Conversation[];

const messages = [
  { id: "m1", conversation_id: "c2", sender_type: "customer", content_type: "text", content_text: "Class 1 to 4 guidebooks", status: "read", created_at: iso(30) },
  { id: "m2", conversation_id: "c2", sender_type: "agent", content_type: "interactive", status: "read", created_at: iso(29), message_id: "w1",
    interactive_payload: { kind: "buttons", body: "*Class 3*\nSavi (₹280): belesu.in/books/savi-kannada-class-3\nKali (₹290): belesu.in/books/kali-kannada-class-3\n\nSingle book covers both Part 1 and Part 2 together!", buttons: [{ id: "a", title: "How to Order" }, { id: "b", title: "Main Menu" }] } },
  { id: "m3", conversation_id: "c2", sender_type: "customer", content_type: "text", content_text: "Thank you, I will order Savi", status: "read", created_at: iso(3) },
] as unknown as Message[];

export default function WaPreview() {
  const [chat, setChat] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChat(new URLSearchParams(location.search).has("chat"));
  }, []);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-wa-bar">
      <Header />
      <main className="min-h-0 flex-1 overflow-hidden bg-wa-panel">
        {chat ? (
          <MessageThread conversation={conversations[2]} contact={conversations[2].contact ?? null} messages={messages}
            onMessagesLoaded={() => {}} onNewMessage={() => {}} onUpdateMessage={() => {}} onStatusChange={() => {}} onAssignChange={() => {}} onBack={() => {}} />
        ) : (
          <ConversationList activeConversationId={null} onSelect={() => {}} conversations={conversations} onConversationsLoaded={() => {}} />
        )}
      </main>
      {!chat && <MobileNav />}
    </div>
  );
}
