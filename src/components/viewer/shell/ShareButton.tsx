"use client";

import { Share08Icon } from "@hugeicons/core-free-icons";
import { IconButton, Tooltip } from "@puckoops/camelot";
import { Popover } from "radix-ui";
import { useState } from "react";

import { SurveyShareCard } from "@/components/viewer/shell/SurveyShareCard";
import { formatSurveyDate } from "@/lib/utils";
import { useViewerStore } from "@/lib/viewer/state/store";
import styles from "./share.module.css";

/** Floats left of the canvas's notifications bell and opens the survey's share card beneath it. */
export function ShareButton() {
  const survey = useViewerStore((s) => s.manifest?.survey ?? null);
  const siteName = useViewerStore((s) => s.project?.name ?? null);
  const [open, setOpen] = useState(false);
  if (!survey) return null;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="absolute top-3 right-[60px] z-30 flex rounded-full border border-hairline bg-surface/90 p-[3px] shadow-[var(--shadow-overlay)] backdrop-blur-md">
        <Tooltip content="Share survey" side="bottom">
          <Popover.Trigger asChild>
            <IconButton icon={Share08Icon} aria-label="Share survey" variant="bare" />
          </Popover.Trigger>
        </Tooltip>
      </div>
      <Popover.Portal>
        <Popover.Content className={styles.card} side="bottom" align="end" sideOffset={8} collisionPadding={12} aria-label="Share survey">
          <SurveyShareCard
            surveyId={survey.id}
            surveyLabel={`Survey of ${formatSurveyDate(survey.survey_date)}`}
            site={{ id: survey.project_id, name: siteName }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
