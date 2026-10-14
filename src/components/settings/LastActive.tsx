"use client";

import { Chip } from "@puckoops/camelot";
import { presence, type Presence } from "@/lib/access/presence";
import { hasJoined } from "@/lib/access/roles";
import type { OrgMember } from "@/lib/api/userSvc";
import { exactTime, lastActive } from "@/lib/time";

const PRESENCE_INK: Record<Exclude<Presence, "now">, string> = {
  today: "text-ink-1",
  week: "text-ink-2",
  month: "text-ink-3",
  dormant: "text-ink-4",
};

/** Last active as a step on the presence scale: a chip while they are here or until they first open it, fading ink between. */
export function LastActive({ member, now }: { member: OrgMember; now: number }) {
  if (!hasJoined(member)) {
    const added = Date.parse(member.joined_at);
    return (
      <Chip tone="neutral" glyph="circle-dashed" title={Number.isFinite(added) ? `Added ${exactTime(added)}` : undefined}>
        Not joined yet
      </Chip>
    );
  }
  const ms = Date.parse(member.last_login_time ?? "");
  if (!Number.isFinite(ms)) return <span className="text-ink-4">—</span>;
  const step = presence(ms, now);
  const title = `Last active ${exactTime(ms)}`;
  if (step === "now") {
    return (
      <Chip tone="teal" glyph="dot" title={title}>
        Active now
      </Chip>
    );
  }
  return (
    <time className={`small whitespace-nowrap ${PRESENCE_INK[step]}`} dateTime={member.last_login_time} title={title}>
      {lastActive(ms, now)}
    </time>
  );
}
