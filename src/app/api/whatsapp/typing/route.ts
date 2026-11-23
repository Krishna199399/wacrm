import { NextResponse } from 'next/server';
import { differenceInHours } from 'date-fns';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

/**
 * POST /api/whatsapp/typing
 *
 * Body: { conversation_id: <internal UUID> }
 *
 * Shows "typing…" on the customer's phone while an agent composes a
 * reply. Meta ties the indicator to the customer's latest inbound
 * message and marks it read, so this is a no-op (204) when there is no
 * inbound message, or the 24 h customer-service window has closed (the
 * agent can only send templates then).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    const limit = checkRateLimit(`typing:${userId}`, RATE_LIMITS.typing);
    if (!limit.success) {
      return rateLimitResponse(limit);
    }

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body.conversation_id === 'string' ? body.conversation_id : null;
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      );
    }

    // Ownership check: the conversation must belong to the caller's account.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('account_id', accountId)
      .maybeSingle();
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const { data: inbound } = await supabase
      .from('messages')
      .select('message_id, created_at')
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'customer')
      .not('message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      !inbound?.message_id ||
      differenceInHours(new Date(), new Date(inbound.created_at)) >= 24
    ) {
      return new NextResponse(null, { status: 204 });
    }

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();
    if (!config) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 });
    }

    try {
      await sendTypingIndicator({
        phoneNumberId: config.phone_number_id,
        accessToken: decrypt(config.access_token),
        inboundMessageId: inbound.message_id,
      });
    } catch (err) {
      // Best-effort UX signal: log and report, never block the agent.
      const message = err instanceof Error ? err.message : 'Unknown Meta API error';
      console.error('[whatsapp/typing] Meta call failed:', message);
      return NextResponse.json({ error: `Meta API error: ${message}` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in WhatsApp typing POST:', error);
    return toErrorResponse(error);
  }
}
