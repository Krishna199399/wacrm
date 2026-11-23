"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { getAvatarColors, getInitials } from "@/lib/inbox/whatsapp-helpers";

interface ContactAvatarProps {
  name: string;
  src?: string | null;
  /** Pixel size of the circle. */
  size?: number;
  className?: string;
}

/**
 * WhatsApp-style circular avatar: the contact's photo when we have one,
 * otherwise initials on a pastel colour derived from the name. Falls
 * back to initials if the photo URL fails to load (expired CDN links
 * are common for WhatsApp profile pictures).
 */
export function ContactAvatar({ name, src, size = 48, className }: ContactAvatarProps) {
  const [failed, setFailed] = useState(false);
  const colors = getAvatarColors(name);
  const showImage = !!src && !failed;

  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        backgroundColor: showImage ? undefined : colors.bg,
        color: colors.fg,
      }}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
