"use client";

import Link from "next/link";
import { LockIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { Button, EmptyState } from "@puckoops/camelot";

import { sitesHref, type SurveyDenial } from "@/lib/viewer/surveyAccess";

/** Covers the canvas, under the notifications bell, when orblode-svc won't show this survey to the person. */
export function SurveyDenied({ denial }: { denial: SurveyDenial }) {
  const unpublished = denial.reason === "unpublished";
  return (
    <div className="absolute inset-0 z-25 flex items-center justify-center bg-canvas px-6">
      <EmptyState
        framed
        className="w-full max-w-md"
        icon={unpublished ? ViewOffIcon : LockIcon}
        title={unpublished ? "This survey isn't published yet." : "You don't have access to this survey."}
        description={
          unpublished
            ? "It opens here once it's published. Until then, the project's published surveys are on its page."
            : "Ask whoever sent you the link to share the survey with you."
        }
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={sitesHref(denial.siteId)}>{denial.siteId ? "See the project's surveys" : "Back to projects"}</Link>
          </Button>
        }
      />
    </div>
  );
}
