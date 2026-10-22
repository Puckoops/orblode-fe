"use client";

import { Button } from "@puckoops/camelot";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSurveyProcessing } from "@/lib/processing/store";
import { ProcessingDialog } from "./ProcessingDialog";

/** A way into the viewer that, while the survey still processes, opens its progress instead. */
export function ProcessingLink({
  surveyId,
  href = `/viewer/${surveyId}`,
  children,
  className,
}: {
  surveyId: string;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const processing = useSurveyProcessing(surveyId);
  const [open, setOpen] = useState(false);
  if (!processing)
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  return (
    <>
      <Button variant="quiet" size="sm" onClick={() => setOpen(true)}>
        Processing · See progress
      </Button>
      {open && <ProcessingDialog surveyId={surveyId} open onClose={() => setOpen(false)} />}
    </>
  );
}
