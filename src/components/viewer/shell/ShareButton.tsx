"use client";

import { Share08Icon } from "@hugeicons/core-free-icons";
import { IconButton, Tooltip } from "@puckoops/camelot";
import { useState } from "react";

import { SurveyShareDialog } from "@/components/viewer/shell/SurveyShareDialog";
import { formatSurveyDate } from "@/lib/utils";
import { useViewerStore } from "@/lib/viewer/state/store";

/** Floats left of the canvas's notifications bell and opens the survey's sharing. */
export function ShareButton() {
  const survey = useViewerStore((s) => s.manifest?.survey ?? null);
  const siteName = useViewerStore((s) => s.project?.name ?? null);
  const [open, setOpen] = useState(false);
  if (!survey) return null;

  return (
    <>
      <div className="absolute top-3 right-[60px] z-30 flex rounded-full border border-hairline bg-surface/90 p-[3px] shadow-[var(--shadow-overlay)] backdrop-blur-md">
        <Tooltip content="Share survey" side="bottom">
          <IconButton icon={Share08Icon} aria-label="Share survey" variant="bare" onClick={() => setOpen(true)} />
        </Tooltip>
      </div>
      {open && (
        <SurveyShareDialog
          surveyId={survey.id}
          surveyLabel={`Survey of ${formatSurveyDate(survey.survey_date)}`}
          site={{ id: survey.project_id, name: siteName }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
