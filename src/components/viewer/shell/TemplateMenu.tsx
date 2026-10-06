"use client";

// TemplateMenu (viewer-shell §4.3, D6) — the chevron half of a TopToolbar split
// button. Lists one primitive's templates from the static catalog
// (lib/viewer/templates.ts) with icon, label and hint; selecting a template
// launches it via the parent's `onSelect` (which routes point → startProbe,
// line/polygon → startDraw with the template's kind/params/folder/slope and
// `toolKey: tpl:<id>`, §3.5).

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { IconButton, Menu, MenuItem, MenuLabel } from "@puckoops/camelot";

import { templatesForPrimitive, type MeasurementTemplate } from "@/lib/viewer/templates";

interface TemplateMenuProps {
  primitive: MeasurementTemplate["primitive"];
  /** Human name of the primitive for the menu header ("Point", "Line", …). */
  primitiveLabel: string;
  /** Shared tool highlight key (§3.5) — the active template's item is marked. */
  activeToolKey: string | null;
  onSelect: (template: MeasurementTemplate) => void;
}

export function TemplateMenu({ primitive, primitiveLabel, activeToolKey, onSelect }: TemplateMenuProps) {
  const templates = templatesForPrimitive(primitive);

  return (
    <Menu
      align="start"
      minWidth={224}
      trigger={
        <IconButton
          icon={ArrowDown01Icon}
          aria-label={`${primitiveLabel} templates`}
          variant="bare"
          size="sm"
          className="h-8 w-5 shrink-0 rounded-l-none rounded-r-full data-[state=open]:bg-surface-3 data-[state=open]:text-ink-1"
        />
      }
    >
      <MenuLabel>{primitiveLabel} templates</MenuLabel>
      {templates.map((t) => {
        const active = activeToolKey === `tpl:${t.id}`;
        return (
          <MenuItem key={t.id} icon={t.icon} onSelect={() => onSelect(t)}>
            <span title={t.hint} className={active ? "font-medium text-ink-1" : undefined}>
              {t.label}
              {active && <span className="caption text-ink-4"> · active</span>}
            </span>
          </MenuItem>
        );
      })}
    </Menu>
  );
}
