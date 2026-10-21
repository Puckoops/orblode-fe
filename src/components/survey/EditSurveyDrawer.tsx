"use client";

import {
  Alert,
  Badge,
  Button,
  DateInput,
  DescriptionList,
  Drawer,
  Field,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@puckoops/camelot";
import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { TagInput } from "@/components/common/TagInput";
import { SurveyFilesTab } from "@/components/survey/SurveyFilesTab";
import { useSurveyFiles } from "@/components/survey/useSurveyFiles";
import { ApiError } from "@/lib/api/client";
import { stripErrNamespace } from "@/lib/api/errors";
import { getSurvey, updateSurvey, type Survey } from "@/lib/api/orblodeSvc";
import { surveyState } from "@/lib/status";
import { isSurveyEditable, surveyDetailsOf, surveyDetailsPatch, type SurveyDetails } from "@/lib/survey/edit";
import { toast } from "@/lib/toast";
import { DATA_TYPES, TAG_SUGGESTIONS, withCurrent } from "@/lib/upload/options";
import type { DataType } from "@/lib/upload/planner";
import { formatSurveyDate } from "@/lib/utils";

type Tab = "details" | "files";

/** Edits one survey's details and source files. Open it by passing a `surveyId`, close it with
 * null; `onChanged` runs after each change the host shows (details, removals, replacements,
 * reprocessing) so it can refetch. */
export function EditSurveyDrawer({
  surveyId,
  onClose,
  onChanged,
  initialTab = "details",
}: {
  surveyId: string | null;
  onClose: () => void;
  onChanged?: (surveyId: string) => void;
  initialTab?: Tab;
}) {
  // Each opening is a fresh session; the last one stays mounted while the drawer animates shut.
  const [prevId, setPrevId] = useState(surveyId);
  const [session, setSession] = useState({ surveyId, key: 0 });
  if (surveyId !== prevId) {
    setPrevId(surveyId);
    if (surveyId !== null) setSession((s) => ({ surveyId, key: s.key + 1 }));
  }

  if (session.surveyId === null) return null;
  return (
    <EditSurveySession
      key={session.key}
      surveyId={session.surveyId}
      open={surveyId !== null}
      onClose={onClose}
      onChanged={onChanged}
      initialTab={initialTab}
    />
  );
}

function EditSurveySession({
  surveyId,
  open,
  onClose,
  onChanged,
  initialTab,
}: {
  surveyId: string;
  open: boolean;
  onClose: () => void;
  onChanged?: (surveyId: string) => void;
  initialTab: Tab;
}) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<SurveyDetails | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSurvey(surveyId)
      .then((s) => {
        if (cancelled) return;
        setSurvey(s);
        setForm(surveyDetailsOf(s));
        setLoadError(null);
        setConflict(false);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? stripErrNamespace(err.message) : "The survey couldn't load.");
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, reloadTick]);

  const changed = useCallback(() => onChanged?.(surveyId), [onChanged, surveyId]);
  const dataType: DataType = survey?.survey_type === "lidar" ? "lidar" : "preprocessed";
  const files = useSurveyFiles({ surveyId, survey, dataType, onSurvey: setSurvey, onChanged: changed });

  const editable = survey ? isSurveyEditable(survey.status) : false;
  const patch = survey && form ? surveyDetailsPatch(survey, form) : null;
  const dateChanged = patch?.survey_date !== undefined;
  const nameMissing = !!survey && !!form && form.datasetName.trim() === "" && surveyDetailsOf(survey).datasetName.trim() !== "";
  const busy = saving || files.busy;

  const save = async () => {
    if (!survey || !patch) return;
    setSaving(true);
    setConflict(false);
    try {
      const updated = await updateSurvey(survey.id, patch);
      setSurvey(updated);
      setForm(surveyDetailsOf(updated));
      toast.success(dateChanged ? "Survey saved; the project's surveys are re-ordered by the new date" : "Survey saved");
      changed();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(true);
      else toast.error(err instanceof Error ? stripErrNamespace(err.message) : "The survey couldn't be saved.");
    } finally {
      setSaving(false);
    }
  };

  const update = (change: Partial<SurveyDetails>) => setForm((f) => (f ? { ...f, ...change } : f));

  const footer =
    !survey || !editable ? (
      <Button variant="quiet" onClick={onClose}>
        Close
      </Button>
    ) : tab === "details" ? (
      <>
        <Button variant="quiet" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} disabled={!patch || nameMissing || conflict || files.busy} onClick={() => void save()}>
          Save changes
        </Button>
      </>
    ) : (
      <>
        <span className="small mr-auto text-ink-4">
          {files.plan && files.plan.dispatches.length > 0
            ? `${files.plan.dispatches.length} dispatch${files.plan.dispatches.length === 1 ? "" : "es"} ready`
            : "Nothing to reprocess"}
        </span>
        <Button variant="quiet" disabled={busy} onClick={onClose}>
          Close
        </Button>
        <Button
          variant="primary"
          loading={files.reprocessing}
          disabled={!files.plan || files.plan.dispatches.length === 0 || busy}
          onClick={() => void files.reprocess()}
        >
          Reprocess
        </Button>
      </>
    );

  return (
    <Drawer
      open={open}
      // Closing mid-upload would hide the progress of a run that keeps going; wait for it, as the confirm dialog does.
      onOpenChange={(next) => !next && !busy && onClose()}
      title="Edit survey"
      description={survey ? `${formatSurveyDate(survey.survey_date)} · ${surveyDetailsOf(survey).datasetName || survey.survey_type}` : undefined}
      width={560}
      footer={footer}
    >
      {loadError ? (
        <Alert tone="critical" title="The survey couldn't load">
          {loadError}
        </Alert>
      ) : !survey || !form ? (
        <Loader label="Loading the survey" />
      ) : (
        <div className="flex flex-col gap-5">
          {!editable && (
            <Alert tone="neutral" title="This survey can't be edited">
              It is {surveyState(survey.status).label.toLowerCase()}. Approved surveys can&apos;t be edited yet; editing is open while a survey is pending,
              processing, ready to approve or failed.
            </Alert>
          )}
          <Tabs variant="segmented" value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="files" count={files.assets?.length}>
                Files
              </TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-5">
              {editable ? (
                <DetailsForm
                  survey={survey}
                  form={form}
                  update={update}
                  disabled={busy}
                  dateChanged={dateChanged}
                  nameMissing={nameMissing}
                  conflict={conflict}
                  onReload={() => setReloadTick((t) => t + 1)}
                />
              ) : (
                <DescriptionList
                  items={[
                    { label: "Survey date", value: formatSurveyDate(survey.survey_date) },
                    { label: "Type", value: DATA_TYPES.find((t) => t.id === survey.survey_type)?.label ?? survey.survey_type },
                    { label: "Dataset name", value: form.datasetName || "—" },
                    {
                      label: "Tags",
                      value: form.tags.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {form.tags.map((t) => (
                            <Badge key={t} variant="tag">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        "—"
                      ),
                    },
                  ]}
                />
              )}
            </TabsContent>
            <TabsContent value="files" className="mt-5">
              <SurveyFilesTab survey={survey} files={files} editable={editable} dataType={dataType} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </Drawer>
  );
}

function DetailsForm({
  survey,
  form,
  update,
  disabled,
  dateChanged,
  nameMissing,
  conflict,
  onReload,
}: {
  survey: Survey;
  form: SurveyDetails;
  update: (change: Partial<SurveyDetails>) => void;
  disabled: boolean;
  dateChanged: boolean;
  nameMissing: boolean;
  conflict: boolean;
  onReload: () => void;
}) {
  const types = withCurrent(
    DATA_TYPES.map((t) => ({ value: t.id as string, label: t.label })),
    survey.survey_type
  );

  return (
    <div className="flex flex-col gap-5">
      {conflict && (
        <Alert
          tone="critical"
          title="This survey changed since you opened it"
          action={
            <Button variant="ghost" size="sm" onClick={onReload}>
              Reload
            </Button>
          }
        >
          Someone saved it or moved its status on after you opened it, so your changes weren&apos;t saved. Reload to see the current details, then make
          your change again.
        </Alert>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3">
        <Field label="Dataset name" error={nameMissing ? "Name the dataset." : undefined}>
          <Input value={form.datasetName} onChange={(e) => update({ datasetName: e.target.value })} disabled={disabled} placeholder="Project — date" />
        </Field>
        <Field label="Survey date">
          <DateInput value={form.surveyDate} onChange={(v) => v && update({ surveyDate: v })} disabled={disabled} />
        </Field>
      </div>
      {dateChanged && (
        <Alert tone="warning" title="A new date re-orders this project's surveys">
          The Survey V numbers of this project change to follow the new order, and stockpile volumes compared against the previous survey are marked stale
          until they are recomputed.
        </Alert>
      )}
      <Field label="Survey type">
        <Select value={form.surveyType || undefined} onValueChange={(v) => update({ surveyType: v })} disabled={disabled} options={types} />
      </Field>
      <section className="flex flex-col gap-2">
        <p className="caps text-4">Tags</p>
        <TagInput tags={form.tags} onChange={(tags) => update({ tags })} suggestions={TAG_SUGGESTIONS} disabled={disabled} />
      </section>
    </div>
  );
}
