"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ContactAvatar } from "./contact-avatar";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

interface ContactSidebarProps {
  contact: Contact | null;
  /** Closes the panel (header X). Optional: no X without it. */
  onClose?: () => void;
}

export function ContactSidebar({ contact, onClose }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const header = (
    <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-wa-divider bg-wa-panel-header px-3 lg:h-[63px]">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={tThread("hideContactPanel")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-wa-icon hover:bg-wa-hover"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      <h2 className="text-[16px] font-medium text-wa-text">{tThread("contactInfo")}</h2>
    </div>
  );

  if (!contact) {
    return (
      <div className="flex h-full w-[340px] flex-col border-l border-wa-divider bg-wa-surface xl:w-[380px]">
        {header}
        <div className="flex flex-1 items-center justify-center p-6">
          <p className="text-center text-sm text-wa-text-2">
            {tThread("selectConversation")}
          </p>
        </div>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const sectionTitle = "mb-3 flex items-center gap-2 text-[14px] text-wa-text-2";

  return (
    <div className="flex h-full w-[340px] flex-col border-l border-wa-divider bg-wa-surface xl:w-[380px]">
      {header}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2.5 pb-6">
          {/* Identity card */}
          <section className="flex flex-col items-center bg-wa-panel px-6 pb-5 pt-7 text-center shadow-[0_1px_2px_rgba(11,20,26,0.06)]">
            <ContactAvatar name={displayName} src={contact.avatar_url} size={120} />
            <h3 className="mt-4 break-words text-[22px] font-normal text-wa-text">
              {displayName}
            </h3>
            {contact.name && contact.name !== contact.phone && (
              <p className="mt-0.5 text-[16px] text-wa-text-2">{contact.phone}</p>
            )}
            {contact.company && (
              <p className="mt-1 text-sm text-wa-text-2">{contact.company}</p>
            )}

            <div className="mt-5 grid w-full grid-cols-2 gap-2.5">
              <a
                href={`tel:${contact.phone}`}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-wa-divider py-3 text-[13px] font-medium text-wa-text transition-colors hover:bg-wa-hover"
              >
                <Phone className="h-5 w-5 text-wa-green" />
                {tSidebar("call")}
              </a>
              <button
                type="button"
                onClick={handleCopyPhone}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-wa-divider py-3 text-[13px] font-medium text-wa-text transition-colors hover:bg-wa-hover"
              >
                {copied ? (
                  <Check className="h-5 w-5 text-wa-green" />
                ) : (
                  <Copy className="h-5 w-5 text-wa-green" />
                )}
                {copied ? tSidebar("copied") : tSidebar("copyNumber")}
              </button>
            </div>
          </section>

          {contact.email && (
            <section className="bg-wa-panel px-6 py-4 shadow-[0_1px_2px_rgba(11,20,26,0.06)]">
              <div className={sectionTitle}>
                <Mail className="h-4 w-4" />
                {tSidebar("email")}
              </div>
              <p className="break-all text-[15px] text-wa-text">{contact.email}</p>
            </section>
          )}

          {/* Tags */}
          <section className="bg-wa-panel px-6 py-4 shadow-[0_1px_2px_rgba(11,20,26,0.06)]">
            <div className={sectionTitle}>
              <TagIcon className="h-4 w-4" />
              {tSidebar("tags")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <p className="text-sm text-wa-text-2">{tSidebar("noTags")}</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </section>

          {/* Deals */}
          <section className="bg-wa-panel px-6 py-4 shadow-[0_1px_2px_rgba(11,20,26,0.06)]">
            <div className={sectionTitle}>
              <DollarSign className="h-4 w-4" />
              {tSidebar("deals")}
            </div>
            <div className="space-y-2">
              {deals.length === 0 ? (
                <p className="text-sm text-wa-text-2">{tSidebar("noDeals")}</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg border border-wa-divider px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-wa-text">{deal.title}</p>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-wa-text-2">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: `${deal.stage.color}22`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Notes */}
          <section className="bg-wa-panel px-6 py-4 shadow-[0_1px_2px_rgba(11,20,26,0.06)]">
            <div className={sectionTitle}>
              <StickyNote className="h-4 w-4" />
              {tSidebar("notes")}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={tSidebar("addNotePlaceholder")}
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-lg bg-wa-surface px-3 py-2 text-sm text-wa-text outline-none placeholder:text-wa-text-2 focus:ring-2 focus:ring-wa-green/50"
              />
              <Button
                size="sm"
                aria-label={tSidebar("addNote")}
                className="h-9 w-9 shrink-0 rounded-full bg-wa-green p-0 text-white hover:bg-wa-green-hover"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-wa-surface px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-[13px] text-wa-text">
                    {note.note_text}
                  </p>
                  <p className="mt-1.5 text-[11px] text-wa-text-2">
                    {format(new Date(note.created_at), "MMM d, yyyy h:mm a")}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
