# WhatsApp Component Usage Guide

Comprehensive guide for using WhatsApp-styled components in WACRM inbox.

## Table of Contents

1. [Overview](#overview)
2. [Core Components](#core-components)
3. [Helper Functions](#helper-functions)
4. [Styling Patterns](#styling-patterns)
5. [Best Practices](#best-practices)

---

## Overview

All WhatsApp UI components use centralized design tokens from `src/app/globals.css` and helper utilities from `src/lib/inbox/whatsapp-helpers.ts`. This ensures consistency and maintainability across the inbox interface.

**Key Files:**
- `src/app/globals.css` - WhatsApp design tokens
- `src/lib/inbox/whatsapp-helpers.ts` - Utility functions
- `src/components/inbox/*` - Inbox components

---

## Core Components

### ConversationList

**Location:** `src/components/inbox/conversation-list.tsx`

**Purpose:** Displays list of conversations with WhatsApp styling

**Usage:**
```tsx
import { ConversationList } from '@/components/inbox/conversation-list'

<ConversationList
  conversations={conversations}
  selectedId={selectedId}
  onSelect={handleSelect}
/>
```

**Key Features:**
- 8 pastel avatar colors cycling by contact name
- WhatsApp green for unread badges
- Beige hover states (`bg-whatsapp-chat-bg`)
- Truncated preview text (40 chars max)
- Relative timestamps ("Just now", "5m", "2h", "Yesterday")

**Visual Elements:**
```tsx
// Avatar with pastel color
<div
  className="size-12 rounded-full flex items-center justify-center text-white font-medium"
  style={{ backgroundColor: getAvatarColor(conversation.contact.name) }}
>
  {getInitials(conversation.contact.name)}
</div>

// Unread badge
{conversation.unreadCount > 0 && (
  <span className="bg-whatsapp-green text-white text-xs font-semibold rounded-full px-2 py-0.5 min-w-5 text-center">
    {formatUnreadCount(conversation.unreadCount)}
  </span>
)}
```

---

### MessageThread

**Location:** `src/components/inbox/message-thread.tsx`

**Purpose:** Main chat interface with WhatsApp beige background

**Usage:**
```tsx
import { MessageThread } from '@/components/inbox/message-thread'

<MessageThread
  conversation={selectedConversation}
  messages={messages}
/>
```

**Key Features:**
- Beige chat background (`bg-whatsapp-chat-bg`)
- Date separators with WhatsApp styling
- Grouped messages by sender
- Auto-scroll to bottom

**Visual Elements:**
```tsx
// Date separator
<div className="flex justify-center my-4">
  <span className="bg-whatsapp-date-separator text-whatsapp-text-primary text-xs font-medium px-3 py-1 rounded-md shadow-sm">
    {formatMessageTime(message.createdAt, 'date-separator')}
  </span>
</div>

// Chat background
<div className="flex-1 overflow-y-auto bg-whatsapp-chat-bg">
  {/* Messages */}
</div>
```

---

### MessageBubble

**Location:** `src/components/inbox/message-bubble.tsx`

**Purpose:** Individual message bubbles (white incoming, pale green outgoing)

**Usage:**
```tsx
import { MessageBubble } from '@/components/inbox/message-bubble'

<MessageBubble
  message={message}
  isOwnMessage={isOwnMessage}
/>
```

**Key Features:**
- White bubbles for incoming (`bg-whatsapp-incoming`)
- Pale green for outgoing (`bg-whatsapp-outgoing`)
- Delivery status icons (single check, double check, blue double check)
- Dark gray timestamps (`text-whatsapp-text-time`)
- Subtle shadows for depth

**Visual Elements:**
```tsx
// Incoming message
<div className="flex justify-start">
  <div className="bg-whatsapp-incoming text-whatsapp-text-primary rounded-lg p-3 max-w-[70%] shadow-sm">
    <p className="text-sm">{message.content}</p>
    <div className="flex items-center gap-1 mt-1 justify-end">
      <span className="text-whatsapp-text-time text-xs">
        {formatMessageTime(message.createdAt, 'bubble')}
      </span>
    </div>
  </div>
</div>

// Outgoing message
<div className="flex justify-end">
  <div className="bg-whatsapp-outgoing text-whatsapp-text-primary rounded-lg p-3 max-w-[70%] shadow-sm">
    <p className="text-sm">{message.content}</p>
    <div className="flex items-center gap-1 mt-1 justify-end">
      <span className="text-whatsapp-text-time text-xs">
        {formatMessageTime(message.createdAt, 'bubble')}
      </span>
      {getDeliveryStatusIcon(message.status)}
    </div>
  </div>
</div>
```

---

### MessageComposer

**Location:** `src/components/inbox/message-composer.tsx`

**Purpose:** Message input with WhatsApp green send button

**Usage:**
```tsx
import { MessageComposer } from '@/components/inbox/message-composer'

<MessageComposer
  onSendMessage={handleSendMessage}
/>
```

**Key Features:**
- WhatsApp green send button (`bg-whatsapp-green`)
- Attachment icon button
- Rounded input field
- Hover states

**Visual Elements:**
```tsx
// Composer container
<div className="bg-whatsapp-composer-bg border-t border-whatsapp-divider p-4">
  <div className="flex items-center gap-2">
    {/* Attachment button */}
    <Button variant="ghost" size="icon" className="shrink-0">
      <Paperclip className="size-5 text-whatsapp-text-secondary" />
    </Button>

    {/* Message input */}
    <Input
      placeholder="Type a message"
      className="flex-1 bg-background"
    />

    {/* Send button */}
    <Button
      size="icon"
      className="shrink-0 bg-whatsapp-green hover:bg-whatsapp-green/90"
    >
      <Send className="size-5" />
    </Button>
  </div>
</div>
```

---

### ContactSidebar

**Location:** `src/components/inbox/contact-sidebar.tsx`

**Purpose:** Contact details panel with WhatsApp styling

**Usage:**
```tsx
import { ContactSidebar } from '@/components/inbox/contact-sidebar'

<ContactSidebar
  contact={selectedContact}
  onClose={handleClose}
/>
```

**Key Features:**
- Large pastel avatar (80x80px)
- WhatsApp green icons
- Proper dark mode dividers (`border-whatsapp-divider`)
- Collapsible sections

**Visual Elements:**
```tsx
// Contact avatar
<div
  className="size-20 rounded-full flex items-center justify-center text-white text-3xl font-semibold mx-auto"
  style={{ backgroundColor: getAvatarColor(contact.name) }}
>
  {getInitials(contact.name)}
</div>

// Info section with green icons
<div className="space-y-3">
  <div className="flex items-start gap-3">
    <Phone className="size-5 text-whatsapp-green shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <p className="text-whatsapp-text-secondary text-sm">Phone</p>
      <p className="text-whatsapp-text-primary font-medium">{contact.phone}</p>
    </div>
  </div>
</div>
```

---

## Helper Functions

### getAvatarColor(name: string): string

Cycles through 8 pastel avatar colors deterministically based on contact name.

```tsx
import { getAvatarColor } from '@/lib/inbox/whatsapp-helpers'

const avatarColor = getAvatarColor('John Doe') // Returns one of 8 pastel colors
```

**Colors:**
1. `oklch(0.65 0.15 25)` - Coral
2. `oklch(0.70 0.12 145)` - Mint
3. `oklch(0.68 0.13 265)` - Lavender
4. `oklch(0.72 0.11 60)` - Peach
5. `oklch(0.65 0.14 200)` - Sky
6. `oklch(0.68 0.12 310)` - Rose
7. `oklch(0.70 0.10 85)` - Lime
8. `oklch(0.67 0.13 180)` - Aqua

---

### getInitials(name: string): string

Extracts initials from contact name (max 2 letters).

```tsx
import { getInitials } from '@/lib/inbox/whatsapp-helpers'

getInitials('John Doe') // 'JD'
getInitials('Alice') // 'AL'
getInitials('Bob Smith Johnson') // 'BS'
```

---

### formatWhatsAppTime(date: Date): string

Formats timestamps for conversation list (relative for today, "Yesterday", or date).

```tsx
import { formatWhatsAppTime } from '@/lib/inbox/whatsapp-helpers'

formatWhatsAppTime(new Date()) // 'Just now'
formatWhatsAppTime(fiveMinutesAgo) // '5m'
formatWhatsAppTime(yesterday) // 'Yesterday'
formatWhatsAppTime(lastWeek) // 'Dec 15'
```

**Output:**
- <1 min: "Just now"
- <60 min: "5m", "45m"
- <24 hrs: "2h", "18h"
- Yesterday: "Yesterday"
- This year: "Dec 15"
- Other years: "12/15/23"

---

### formatMessageTime(date: Date, format: 'bubble' | 'date-separator'): string

Formats timestamps for message bubbles and date separators.

```tsx
import { formatMessageTime } from '@/lib/inbox/whatsapp-helpers'

// Message bubble timestamp
formatMessageTime(new Date(), 'bubble') // '2:30 PM'

// Date separator
formatMessageTime(new Date(), 'date-separator') // 'Today'
formatMessageTime(yesterday, 'date-separator') // 'Yesterday'
formatMessageTime(lastWeek, 'date-separator') // 'December 15, 2024'
```

---

### truncateMessage(text: string, maxLength: number = 40): string

Truncates message preview text with ellipsis.

```tsx
import { truncateMessage } from '@/lib/inbox/whatsapp-helpers'

truncateMessage('This is a very long message that needs to be truncated', 40)
// 'This is a very long message that need...'
```

---

### getDeliveryStatusIcon(status: string): React.ReactNode

Returns delivery status icon (single check, double check, blue double check).

```tsx
import { getDeliveryStatusIcon } from '@/lib/inbox/whatsapp-helpers'

getDeliveryStatusIcon('sent') // <Check className="size-3 text-whatsapp-text-time" />
getDeliveryStatusIcon('delivered') // <CheckCheck className="size-3 text-whatsapp-text-time" />
getDeliveryStatusIcon('read') // <CheckCheck className="size-3 text-blue-500" />
```

---

### isToday(date: Date): boolean

Checks if date is today.

```tsx
import { isToday } from '@/lib/inbox/whatsapp-helpers'

isToday(new Date()) // true
isToday(yesterday) // false
```

---

### formatUnreadCount(count: number): string

Formats unread count with "99+" cap.

```tsx
import { formatUnreadCount } from '@/lib/inbox/whatsapp-helpers'

formatUnreadCount(5) // '5'
formatUnreadCount(150) // '99+'
```

---

## Styling Patterns

### Avatar Colors

Always use `getAvatarColor()` helper for consistency:

```tsx
// ✅ Correct
<div style={{ backgroundColor: getAvatarColor(contact.name) }}>
  {getInitials(contact.name)}
</div>

// ❌ Wrong - random colors
<div className="bg-blue-500">JD</div>
```

---

### Message Bubbles

Use semantic tokens, not raw colors:

```tsx
// ✅ Correct
<div className="bg-whatsapp-incoming text-whatsapp-text-primary">
  {message.content}
</div>

// ❌ Wrong - hardcoded colors
<div className="bg-white text-gray-900">
  {message.content}
</div>
```

---

### Timestamps

Use `text-whatsapp-text-time` for all timestamps:

```tsx
// ✅ Correct
<span className="text-whatsapp-text-time text-xs">
  {formatMessageTime(message.createdAt, 'bubble')}
</span>

// ❌ Wrong - generic muted
<span className="text-muted-foreground text-xs">
  {formatMessageTime(message.createdAt, 'bubble')}
</span>
```

---

### Hover States

Use `bg-whatsapp-chat-bg` for conversation list hover:

```tsx
// ✅ Correct
<div className="hover:bg-whatsapp-chat-bg transition-colors">
  {/* Conversation item */}
</div>

// ❌ Wrong - generic hover
<div className="hover:bg-muted">
  {/* Conversation item */}
</div>
```

---

### Dividers

Use `border-whatsapp-divider` for all borders:

```tsx
// ✅ Correct
<div className="border-t border-whatsapp-divider">
  {/* Content */}
</div>

// ❌ Wrong - generic border
<div className="border-t border-border">
  {/* Content */}
</div>
```

---

## Best Practices

### 1. Always Use Helper Functions

**Do:**
```tsx
import { getAvatarColor, getInitials, formatWhatsAppTime } from '@/lib/inbox/whatsapp-helpers'

<div style={{ backgroundColor: getAvatarColor(contact.name) }}>
  {getInitials(contact.name)}
</div>
<span>{formatWhatsAppTime(conversation.lastMessageAt)}</span>
```

**Don't:**
```tsx
// Hardcoded logic
<div className="bg-blue-500">
  {contact.name.charAt(0)}
</div>
<span>{new Date(conversation.lastMessageAt).toLocaleTimeString()}</span>
```

---

### 2. Use Semantic Tokens

**Do:**
```tsx
<div className="bg-whatsapp-chat-bg text-whatsapp-text-primary border-whatsapp-divider">
  {/* Content */}
</div>
```

**Don't:**
```tsx
<div className="bg-beige-100 text-gray-900 border-gray-200">
  {/* Content */}
</div>
```

---

### 3. Maintain Consistency

**Avatar Sizes:**
- Conversation list: `size-12` (48px)
- Contact sidebar: `size-20` (80px)
- Group avatars: Use same color logic

**Icon Sizes:**
- UI icons: `size-5` (20px)
- Delivery status: `size-3` (12px)

**Spacing:**
- Padding: `p-3`, `p-4`
- Gaps: `gap-2`, `gap-3`
- Margins: `mb-4`, `mt-1`

---

### 4. Dark Mode Support

All tokens include dark mode overrides - no need to add `dark:` classes manually:

```tsx
// ✅ Correct - token handles dark mode
<div className="bg-whatsapp-chat-bg">
  {/* Content */}
</div>

// ❌ Wrong - manual dark mode
<div className="bg-beige-100 dark:bg-gray-800">
  {/* Content */}
</div>
```

---

### 5. Accessibility

**Focus States:**
```tsx
<button className="focus-visible:ring-2 focus-visible:ring-whatsapp-green">
  {/* Button content */}
</button>
```

**Screen Reader Labels:**
```tsx
<button aria-label="Send message">
  <Send className="size-5" />
</button>
```

**Keyboard Navigation:**
- Ensure all interactive elements are keyboard accessible
- Maintain logical tab order
- Provide visual focus indicators

---

## Common Issues & Solutions

### Issue: Avatar colors not cycling properly

**Problem:**
```tsx
<div className="bg-blue-500"> {/* Wrong */}
```

**Solution:**
```tsx
import { getAvatarColor } from '@/lib/inbox/whatsapp-helpers'

<div style={{ backgroundColor: getAvatarColor(contact.name) }}>
```

---

### Issue: Timestamps not formatted correctly

**Problem:**
```tsx
<span>{new Date(message.createdAt).toLocaleTimeString()}</span>
```

**Solution:**
```tsx
import { formatMessageTime } from '@/lib/inbox/whatsapp-helpers'

<span>{formatMessageTime(message.createdAt, 'bubble')}</span>
```

---

### Issue: Dark mode dividers invisible

**Problem:**
```tsx
<div className="border-t border-gray-200"> {/* Wrong */}
```

**Solution:**
```tsx
<div className="border-t border-whatsapp-divider"> {/* Uses dark mode token */}
```

---

### Issue: Message bubbles wrong color

**Problem:**
```tsx
<div className="bg-primary"> {/* Wrong for WhatsApp */}
```

**Solution:**
```tsx
<div className={isOwnMessage ? "bg-whatsapp-outgoing" : "bg-whatsapp-incoming"}>
```

---

## Testing Checklist

Before deploying inbox components:

- [ ] Avatar colors cycle through all 8 pastel colors
- [ ] Initials display correctly (max 2 letters)
- [ ] Timestamps show relative times in conversation list
- [ ] Message bubbles use correct colors (white incoming, pale green outgoing)
- [ ] Delivery status icons display correctly (single check, double check, blue)
- [ ] Unread badges show WhatsApp green
- [ ] Hover states use beige background
- [ ] Dark mode contrast meets WCAG standards (see WHATSAPP_TOKEN_REFERENCE.md)
- [ ] Focus states visible on all interactive elements
- [ ] Keyboard navigation works correctly
- [ ] Screen reader labels present on icon-only buttons

---

## Related Documentation

- [WhatsApp Token Reference](./WHATSAPP_TOKEN_REFERENCE.md) - Complete token documentation
- [WhatsApp Visual Changelog](./WHATSAPP_VISUAL_CHANGELOG.md) - Before/after changes
- [Implementation Plan](../WACRM_WHATSAPP_UI_IMPLEMENTATION_PLAN.md) - Sprint details

---

**Last Updated:** Sprint 6 (Day 6)
**Status:** Complete
