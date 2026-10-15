"use client";

import { Cancel01Icon, Delete02Icon, File01Icon, FileScanIcon, FileSyncIcon, PencilEdit02Icon, RedoIcon, UndoIcon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Button,
  Dropzone,
  Field,
  Icon,
  IconButton,
  Progress,
  Select,
  TextLink,
  Tooltip,
} from "@puckoops/camelot";
import Link from "next/link";
import { useRef, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { useConfirm } from "@/components/common/confirm";
import { StateChip } from "@/components/common/StateChip";
import type { SurveyFiles } from "@/components/survey/useSurveyFiles";
import type { SourceAsset, Survey, UpdateSurveyAssetRequest } from "@/lib/api/orblodeSvc";
import { stripErrNamespace } from "@/lib/api/errors";
import { failureLines, failureTitle } from "@/lib/processing/summary";
import { NEEDS_CRS, NEEDS_REPROCESSING, PENDING_UPLOAD, PROCESSING_FAILED, READING_FILE, UPLOAD_ROW, crsSourceState, type StateStyle } from "@/lib/status";
import { assetName, assetRole, canReprocess } from "@/lib/survey/edit";
import { assetFolders } from "@/lib/survey/folders";
import { toast } from "@/lib/toast";
import { CRS_OPTIONS, VDATUM_OPTIONS, withCurrent } from "@/lib/upload/options";
import {
  ACCEPT,
  DROPZONE_HINT,
  PROCESSED_OUTPUT,
  ROLE_LABELS,
  SELECTABLE_ROLES,
  roleToAssetKind,
  skipReason,
  type DataType,
  type FileRole,
} from "@/lib/upload/planner";
import { crsSourceLabel, detectionNote, effectiveCrs, isInspecting } from "@/lib/upload/review";

function formatBytes(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export function SurveyFilesTab({
  survey,
  files,
  editable,
  dataType,
}: {
  survey: Survey;
  files: SurveyFiles;
  editable: boolean;
  dataType: DataType;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<SourceAsset | null>(null);

  if (files.loadError) {
    return (
      <Alert tone="critical" title="The survey's files couldn't load" action={<Button variant="ghost" size="sm" onClick={() => void files.reload()}>Try again</Button>}>
        {files.loadError}
      </Alert>
    );
  }
  if (!files.assets) return <Loader label="Loading files" />;

  const pickReplacement = (asset: SourceAsset) => {
    replaceTarget.current = asset;
    pickerRef.current?.click();
  };

  const confirmRemove = (asset: SourceAsset) => {
    const role = assetRole(asset);
    const output = asset.status === "pending_upload" || !role ? null : PROCESSED_OUTPUT[role];
    const name = <span className="font-medium text-ink-1">{assetName(asset)}</span>;
    confirm({
      title: "Remove this file?",
      description: output ? (
        <>
          {name} leaves this survey, and the viewer drops what was built from it: <span className="font-medium text-ink-1">{output}</span>. Nothing
          needs reprocessing afterwards.
        </>
      ) : (
        <>{name} leaves this survey. Nothing was built from it, so nothing else changes.</>
      ),
      confirmLabel: "Remove file",
      onConfirm: () => files.remove(asset),
    });
  };

  const groups = assetFolders(files.assets);
  const plan = files.plan;
  const processing = files.processing;
  const notDue = (list: SourceAsset[]) => list.filter((a) => canReprocess(a) && !files.isDue(a));
  const failedToInclude = notDue(files.assets.filter((a) => files.failures.has(a.id)));
  const toInclude = notDue(files.assets);
  const chosen = files.assets.filter(files.isChosen);

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={pickerRef}
        type="file"
        hidden
        accept={ACCEPT[dataType]}
        onChange={(e) => {
          const file = e.target.files?.[0];
          const target = replaceTarget.current;
          e.target.value = "";
          if (file && target) void files.replace(target, file);
        }}
      />

      {processing && processing.failures.length > 0 && (
        <Alert
          tone="critical"
          title={failureTitle(processing)}
          action={
            editable && failedToInclude.length > 0 ? (
              <Button variant="ghost" size="sm" disabled={files.busy} onClick={() => files.choose(failedToInclude, true)}>
                Include failed files
              </Button>
            ) : undefined
          }
        >
          {failureLines(processing).map((line, i) => (
            <span key={processing.failures[i].workflow_id} className="block wrap-anywhere">
              {line}
            </span>
          ))}
          {editable && (
            <span className="mt-1 block">
              Fix the file&apos;s role or CRS, or replace it, then reprocess. If nothing needed fixing, include it in reprocessing as it is.
            </span>
          )}
        </Alert>
      )}

      {groups.length === 0 ? (
        <p className="caption text-ink-4">This survey has no source files yet.</p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-1.5">
            <p className="caps px-1 text-ink-4">{g.label}</p>
            <ul className="overflow-hidden rounded-md border border-hairline bg-surface">
              {g.assets.map((a, i) => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  last={i === g.assets.length - 1}
                  editable={editable}
                  files={files}
                  editing={editingId === a.id}
                  onEdit={() => setEditingId(a.id)}
                  onEditDone={() => setEditingId(null)}
                  onReplace={() => pickReplacement(a)}
                  onRemove={() => confirmRemove(a)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {editable && <AddFiles files={files} dataType={dataType} />}

      {editable && plan && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <p className="caps mr-auto text-ink-4">Reprocessing</p>
            {chosen.length > 0 && (
              <Button variant="quiet" size="sm" disabled={files.busy} onClick={() => files.choose(chosen, false)}>
                Clear
              </Button>
            )}
            {toInclude.length > 0 && (
              <Button variant="quiet" size="sm" disabled={files.busy} onClick={() => files.choose(toInclude, true)}>
                Include every file
              </Button>
            )}
          </div>
          {plan.dispatches.length === 0 ? (
            <p className="caption px-1 text-ink-4">
              Nothing to reprocess. Replaced, edited and added files are listed here until their layers are rebuilt, and so is any file you include to run
              again as it is.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface px-4 py-3">
                {plan.dispatches.map((d) => (
                  <li key={d.label} className="small text-ink-2">
                    {d.label}
                  </li>
                ))}
              </ul>
              {survey.status === "ready_to_approve" && <p className="caption px-1 text-ink-4">Reprocessing moves this survey back to processing.</p>}
            </>
          )}
          {plan.skips.length > 0 && (
            <Alert tone="warning" title="Some files are stored but won't be processed">
              {plan.skips.map((s) => (
                <p key={s.filename}>
                  {s.filename}: {s.reason}
                </p>
              ))}
            </Alert>
          )}
        </section>
      )}

      {files.dispatched && (
        <Alert
          tone="info"
          title={`${files.dispatched.count} processing workflow${files.dispatched.count === 1 ? "" : "s"} dispatched`}
          action={
            files.dispatched.terrain ? (
              <TextLink as={Link} href={`/reports?site=${encodeURIComponent(survey.project_id)}&tab=inventory`} arrow="forward">
                Stockpile inventory
              </TextLink>
            ) : undefined
          }
        >
          Processing runs in the background; the viewer&apos;s layers update as each workflow finishes.
          {files.dispatched.terrain &&
            " Stockpile volumes measured on the replaced terrain show as stale until you recompute them: Compute all stockpiles in the viewer's stockpile actions menu."}
        </Alert>
      )}

      {confirmDialog}
    </div>
  );
}

function AssetRow({
  asset,
  last,
  editable,
  files,
  editing,
  onEdit,
  onEditDone,
  onReplace,
  onRemove,
}: {
  asset: SourceAsset;
  last: boolean;
  editable: boolean;
  files: SurveyFiles;
  editing: boolean;
  onEdit: () => void;
  onEditDone: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const name = assetName(asset);
  const replacement = files.replacing[asset.id];
  const role = assetRole(asset);
  const pending = asset.status === "pending_upload";
  const isDesign = role === "design";
  const dueForProcessing = !pending && !isDesign && files.isDue(asset);
  const chosen = files.isChosen(asset);
  const failed = files.failures.get(asset.id) ?? [];
  const busy = files.busy;
  const crs = effectiveCrs(asset);
  const meta = [formatBytes(asset.size_bytes), crs, asset.vertical_datum || asset.declared_vertical_datum].filter(Boolean).join(" · ");
  const inspecting = isInspecting(asset, files.checkedAt);
  const source = crsSourceLabel(asset);
  const needsCrs = !pending && !!role && !isDesign && !crs && skipReason(name, role) === null;
  const crsChip: StateStyle | null = inspecting
    ? READING_FILE
    : source
      ? crsSourceState(source, asset.detection?.crs?.confidence)
      : needsCrs
        ? NEEDS_CRS
        : null;
  const note = detectionNote(asset, files.checkedAt);
  const notes = [...(asset.detection?.warnings ?? []), ...(note ? [note] : [])];

  return (
    <li className={`px-4 py-3 ${last ? "" : "border-b border-hairline"}`}>
      <div className="flex items-center gap-3">
        <Icon icon={File01Icon} size={16} className="shrink-0 text-ink-4" />
        <div className="min-w-0 flex-1">
          <p className="small truncate text-ink-1">{name}</p>
          <p className="num-sm truncate text-ink-4">
            {replacement ? `Replacing with ${replacement.file.name}` : meta || "—"}
          </p>
        </div>
        {replacement ? (
          <StateChip state={UPLOAD_ROW[replacement.status]} />
        ) : pending ? (
          <StateChip state={PENDING_UPLOAD} />
        ) : dueForProcessing ? (
          <StateChip state={NEEDS_REPROCESSING} />
        ) : failed.length > 0 ? (
          <StateChip state={PROCESSING_FAILED} />
        ) : null}
        {editable && !replacement && (
          <div className="flex shrink-0 items-center gap-1">
            {canReprocess(asset) && (chosen || !dueForProcessing) && (
              <Tooltip content={chosen ? "Leave out of reprocessing" : "Include in reprocessing"}>
                <IconButton
                  icon={chosen ? UndoIcon : RedoIcon}
                  aria-label={chosen ? `Leave ${name} out of reprocessing` : `Include ${name} in reprocessing`}
                  variant="bare"
                  size="sm"
                  disabled={busy || editing}
                  onClick={() => files.choose([asset], !chosen)}
                />
              </Tooltip>
            )}
            {!isDesign && !pending && (
              <>
                <Tooltip content="Detect again">
                  <IconButton
                    icon={FileScanIcon}
                    aria-label={`Detect ${name} again`}
                    variant="bare"
                    size="sm"
                    disabled={busy || editing || inspecting || files.redetecting.has(asset.id)}
                    onClick={() => void files.detectAgain(asset)}
                  />
                </Tooltip>
                <Tooltip content="Replace file">
                  <IconButton icon={FileSyncIcon} aria-label={`Replace ${name}`} variant="bare" size="sm" disabled={busy || editing} onClick={onReplace} />
                </Tooltip>
                <Tooltip content="Edit role and CRS">
                  <IconButton icon={PencilEdit02Icon} aria-label={`Edit ${name}`} variant="bare" size="sm" disabled={busy || editing} onClick={onEdit} />
                </Tooltip>
              </>
            )}
            <Tooltip content="Remove file">
              <IconButton icon={Delete02Icon} aria-label={`Remove ${name}`} variant="bare" size="sm" disabled={busy || editing} onClick={onRemove} />
            </Tooltip>
          </div>
        )}
        {replacement?.status === "error" && (
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="quiet" disabled={busy} onClick={() => void files.replace(asset, replacement.file)}>
              Retry
            </Button>
            <IconButton icon={Cancel01Icon} aria-label={`Cancel replacing ${name}`} variant="bare" size="sm" disabled={busy} onClick={() => files.cancelReplace(asset)} />
          </div>
        )}
      </div>
      {replacement?.status === "uploading" && (
        <Progress value={Math.round(replacement.progress * 100)} size="thin" aria-label={`${replacement.file.name} upload`} className="mt-2" />
      )}
      {!replacement && (crsChip || notes.length > 0 || failed.length > 0) && (
        <div className="mt-2 flex flex-col items-start gap-1 pl-7">
          {failed.map((line) => (
            <p key={line} className="caption text-ink-2 wrap-anywhere">
              {line}
            </p>
          ))}
          {crsChip && <StateChip state={crsChip} />}
          {notes.map((n) => (
            <p key={n} className="caption text-ink-3">
              {n}
            </p>
          ))}
        </div>
      )}
      {editing && <AssetEditor asset={asset} onSave={(patch) => files.saveAsset(asset, patch)} onDone={onEditDone} />}
    </li>
  );
}

function AssetEditor({
  asset,
  onSave,
  onDone,
}: {
  asset: SourceAsset;
  onSave: (patch: UpdateSurveyAssetRequest) => Promise<void>;
  onDone: () => void;
}) {
  const current = assetRole(asset);
  const [role, setRole] = useState<string>(current ?? "");
  const [crs, setCrs] = useState(asset.crs ?? "");
  const [vdatum, setVdatum] = useState(asset.vertical_datum ?? "");
  const [saving, setSaving] = useState(false);

  const roles = SELECTABLE_ROLES.preprocessed.map((r) => ({ value: r as string, label: ROLE_LABELS[r] }));
  const patch: UpdateSurveyAssetRequest = {};
  if (role && role !== (current ?? "")) {
    patch.role = role;
    patch.kind = roleToAssetKind(role as FileRole);
  }
  if (crs && crs !== (asset.crs ?? "")) patch.crs = crs;
  if (vdatum && vdatum !== (asset.vertical_datum ?? "")) patch.vertical_datum = vdatum;
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(patch);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? stripErrNamespace(err.message) : "The file couldn't be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-hairline pt-3">
      <Field label="Role" hint="What the file is decides which processor builds its layer.">
        <Select value={role || undefined} onValueChange={setRole} disabled={saving} placeholder="Select a role…" options={withCurrent(roles, current ?? undefined)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Coordinate reference system">
          <Select value={crs || undefined} onValueChange={setCrs} disabled={saving} placeholder="Select the CRS…" options={withCurrent(CRS_OPTIONS, asset.crs)} />
        </Field>
        <Field label="Vertical datum">
          <Select value={vdatum || undefined} onValueChange={setVdatum} disabled={saving} placeholder="Not set" options={withCurrent(VDATUM_OPTIONS, asset.vertical_datum)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="quiet" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </div>
  );
}

function AddFiles({ files, dataType }: { files: SurveyFiles; dataType: DataType }) {
  const { queue, adding } = files;
  const roles = SELECTABLE_ROLES[dataType];
  const failed = queue.some((q) => q.status === "error");

  return (
    <section className="flex flex-col gap-2">
      <p className="caps px-1 text-ink-4">Add files</p>
      <Dropzone
        onFiles={(list) => !adding && files.enqueue(list)}
        accept={ACCEPT[dataType]}
        multiple
        disabled={adding}
        title="Drag & drop files here, or browse"
        hint={DROPZONE_HINT[dataType]}
      />
      {queue.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {queue.map((q) => (
              <li key={q.file.name} className="rounded-md border border-hairline bg-surface px-4 py-3">
                <div className="flex items-center gap-3">
                  <Icon icon={File01Icon} size={16} className="shrink-0 text-ink-4" />
                  <span className="small min-w-0 flex-1 truncate text-ink-1">{q.file.name}</span>
                  <span className="num-sm shrink-0 text-ink-4">{formatBytes(q.file.size)}</span>
                  <Select
                    variant="filter"
                    aria-label={`Role of ${q.file.name}`}
                    value={q.role}
                    onValueChange={(v) => files.setQueuedRole(q.file.name, v as FileRole)}
                    disabled={adding || roles.length < 2}
                    options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  />
                  {adding ? (
                    q.status !== "queued" && <StateChip state={UPLOAD_ROW[q.status]} />
                  ) : (
                    <IconButton icon={Cancel01Icon} aria-label={`Remove ${q.file.name}`} variant="bare" size="sm" onClick={() => files.dequeue(q.file.name)} />
                  )}
                </div>
                {(q.status === "uploading" || q.status === "uploaded") && (
                  <Progress value={Math.round(q.progress * 100)} size="thin" aria-label={`${q.file.name} upload`} className="mt-2" />
                )}
              </li>
            ))}
          </ul>
          <Field label="CRS for files that don't say" hint="Optional. Each file's own CRS comes first. This starts as the one the survey was uploaded in.">
            <Select
              value={files.queueCrs}
              onValueChange={files.setQueueCrs}
              disabled={adding}
              allLabel="None"
              options={withCurrent(CRS_OPTIONS, files.queueCrs)}
            />
          </Field>
          <div className="flex justify-end">
            <Button size="sm" variant="primary" loading={adding} disabled={files.readingRoles || (files.busy && !adding)} onClick={() => void files.uploadQueue()}>
              {failed ? "Retry upload" : `Upload ${queue.length} file${queue.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
