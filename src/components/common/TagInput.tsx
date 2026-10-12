"use client";

import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Badge, Button, IconButton } from "@puckoops/camelot";
import { useState } from "react";

/** Free-form tags as removable badges; Enter or a comma adds what is typed, Backspace on an empty
 * input removes the last tag. Suggestions not yet added render as quick-add buttons underneath. */
export function TagInput({
  tags,
  onChange,
  suggestions = [],
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [input, setInput] = useState("");

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, "");
    if (!t) return;
    if (!tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };

  return (
    <>
      <div className="flex min-h-[var(--control-h)] flex-wrap items-center gap-2 rounded-sm border border-control bg-surface px-3 py-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <Badge variant="tag">{t}</Badge>
            <IconButton icon={Cancel01Icon} aria-label={`Remove tag ${t}`} variant="bare" size="sm" onClick={() => onChange(tags.filter((x) => x !== t))} />
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(input);
            } else if (e.key === "Backspace" && !input && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
          disabled={disabled}
          aria-label="Add a tag"
          placeholder={tags.length === 0 ? "Add tags…" : ""}
          className="small h-6 min-w-24 flex-1 bg-transparent text-ink-1 outline-none placeholder:text-ink-4"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions
          .filter((s) => !tags.includes(s))
          .map((s) => (
            <Button key={s} size="sm" variant="quiet" iconStart={Add01Icon} disabled={disabled} onClick={() => addTag(s)}>
              {s}
            </Button>
          ))}
      </div>
    </>
  );
}
