import { NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils';
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';

/**
 * POST /api/inbox/resolve-phone
 *
 * Given a phone number (and optional customer name), finds or creates
 * the contact and an open conversation for the caller's active account.
 * Used for deep-linking from Belesu Admin (e.g. Abandoned Carts) into
 * WACRM Inbox with the conversation thread ready.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!rawPhone) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const sanitized = sanitizePhoneForMeta(rawPhone);
    if (!isValidE164(sanitized)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be E.164 (7-15 digits).' },
        { status: 400 }
      );
    }

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : sanitized;
    const auditUserId = await resolveAuditUserId(supabase, accountId);

    // 1. Find or create the contact
    let contactId: string;
    const existingContact = await findExistingContact(supabase, accountId, sanitized);

    if (existingContact) {
      contactId = existingContact.id;
      // Update name if contact was unnamed or phone-only before
      if (body.name && existingContact.name === existingContact.phone) {
        await supabase
          .from('contacts')
          .update({ name: body.name.trim(), updated_at: new Date().toISOString() })
          .eq('id', existingContact.id);
      }
    } else {
      const { data: newContact, error: createContactErr } = await supabase
        .from('contacts')
        .insert({
          account_id: accountId,
          user_id: auditUserId,
          phone: sanitized,
          name,
        })
        .select('id')
        .single();

      if (createContactErr || !newContact) {
        if (isUniqueViolation(createContactErr)) {
          const raced = await findExistingContact(supabase, accountId, sanitized);
          if (raced) {
            contactId = raced.id;
          } else {
            return NextResponse.json({ error: 'Failed to resolve contact' }, { status: 500 });
          }
        } else {
          console.error('[resolve-phone] Failed to insert contact:', createContactErr);
          return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
        }
      } else {
        contactId = newContact.id;
      }
    }

    // 2. Find or create the conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingConv) {
      return NextResponse.json({
        success: true,
        conversationId: existingConv.id,
        contactId,
      });
    }

    // Create new conversation
    const { data: newConv, error: createConvErr } = await supabase
      .from('conversations')
      .insert({
        account_id: accountId,
        user_id: auditUserId,
        contact_id: contactId,
        status: 'open',
      })
      .select('id')
      .single();

    if (createConvErr || !newConv) {
      if (isUniqueViolation(createConvErr)) {
        const { data: racedConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('account_id', accountId)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (racedConv) {
          return NextResponse.json({
            success: true,
            conversationId: racedConv.id,
            contactId,
          });
        }
      }
      console.error('[resolve-phone] Failed to create conversation:', createConvErr);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      conversationId: newConv.id,
      contactId,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
