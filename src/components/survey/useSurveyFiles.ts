"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDetectionPoll } from "@/hooks/useDetectionPoll";
import { refusalMessage } from "@/lib/api/client";
import {
  generateSurvey,
  getSurveyProcessing,
  inspectAsset,
  listSurveyAssets,
  removeSurveyAsset,
  updateSurveyAsset,
  updateSurveyStatus,
  type SourceAsset,
  type Survey,
  type SurveyProcessing,
  type UpdateSurveyAssetRequest,
} from "@/lib/api/orblodeSvc";
import { stripErrNamespace } from "@/lib/api/errors";
import { useProcessing } from "@/lib/processing/store";
import { failuresByAsset } from "@/lib/processing/summary";
import { assetName, assetRole, canReprocess, reprocessPlan, surveySourceCrs, type ReprocessPlan } from "@/lib/survey/edit";
import { toast } from "@/lib/toast";
import { uploadFiles, type AssetSlot, type UploadFileStatus } from "@/lib/upload/pipeline";
import { guessRole, roleNeedsHeader, roleToAssetKind, settleRole, type DataType, type FileRole } from "@/lib/upload/planner";
import { refineRoles } from "@/lib/upload/rasterRole";
import { UploadTimeoutError } from "@/lib/upload/putToSignedUrl";
import { isInspecting } from "@/lib/upload/review";
import { uploadApi } from "@/lib/upload/uploadApi";

export interface ReplaceState {
  file: File;
  progress: number;
  status: "uploading" | "error";
}

export interface QueuedFile {
  file: File;
  role: FileRole;
  readingRole: boolean;
  progress: number;
  status: "queued" | UploadFileStatus;
}

export interface DispatchOutcome {
  count: number;
  terrain: boolean;
}

const errorText = (err: unknown, fallback: string) => {
  const text = err instanceof Error && err.message ? stripErrNamespace(err.message) : fallback;
  return err instanceof UploadTimeoutError ? `${text} — retry to resume from where it stopped.` : text;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A survey's source files and every change the edit drawer makes to them. `onChanged` runs after
 * each change that alters what the hosting view shows, so it can refetch. */
export function useSurveyFiles({
  surveyId,
  survey,
  dataType,
  onSurvey,
  onChanged,
}: {
  surveyId: string;
  survey: Survey | null;
  dataType: DataType;
  onSurvey: (survey: Survey) => void;
  onChanged?: () => void;
}) {
  const [assets, setAssets] = useState<SourceAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<Record<string, ReplaceState>>({});
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  // null until picked: the survey's own CRS stands in; "" is a pick of none.
  const [queueCrs, setQueueCrs] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const [pollRound, setPollRound] = useState<number | null>(null);
  const [redetecting, setRedetecting] = useState<ReadonlySet<string>>(new Set());
  // Files added in this drawer count as due even before the list reloads with their needs_processing.
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(new Set());
  // Unchanged files picked to run through their processor again.
  const [chosenIds, setChosenIds] = useState<ReadonlySet<string>>(new Set());
  const [processing, setProcessing] = useState<SurveyProcessing | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [dispatched, setDispatched] = useState<DispatchOutcome | null>(null);
  // Upload slots per run, kept across a failure so the retry resumes (ORB-38).
  const replaceRuns = useRef<Record<string, { file: File; slots: Record<string, AssetSlot> }>>({});
  const queueSlots = useRef<Record<string, AssetSlot>>({});

  const showAndWatch = useCallback((list: SourceAsset[]) => {
    const now = Date.now();
    setAssets(list);
    setCheckedAt(now);
    if (list.some((a) => isInspecting(a, now))) setPollRound((r) => (r ?? 0) + 1);
  }, []);

  const reload = useCallback(async () => {
    try {
      const { assets: list } = await listSurveyAssets(surveyId);
      showAndWatch(list || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, "The survey's files couldn't load."));
    }
  }, [surveyId, showAndWatch]);

  useEffect(() => {
    let cancelled = false;
    listSurveyAssets(surveyId)
      .then(({ assets: list }) => {
        if (!cancelled) showAndWatch(list || []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorText(err, "The survey's files couldn't load."));
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, showAndWatch]);

  const pollDetections = useCallback(async () => {
    const { assets: list } = await listSurveyAssets(surveyId);
    const now = Date.now();
    setAssets(list || []);
    setCheckedAt(now);
    return (list || []).some((a) => isInspecting(a, now));
  }, [surveyId]);

  useDetectionPoll(pollDetections, pollRound);

  // Without the survey's processing the files show no failures; the site panel and the viewer still do.
  const loadProcessing = useCallback(async () => {
    try {
      setProcessing(await getSurveyProcessing(surveyId));
    } catch {}
  }, [surveyId]);

  useEffect(() => {
    let cancelled = false;
    getSurveyProcessing(surveyId)
      .then((p) => {
        if (!cancelled) setProcessing(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  const detectAgain = async (asset: SourceAsset) => {
    setRedetecting((prev) => new Set(prev).add(asset.id));
    try {
      const updated = await inspectAsset(surveyId, asset.id);
      setAssets((prev) => prev?.map((a) => (a.id === asset.id ? { ...a, ...updated } : a)) ?? prev);
      setCheckedAt(Date.now());
      setPollRound((r) => (r ?? 0) + 1);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't ask for the file to be read again. Try again."));
    } finally {
      setRedetecting((prev) => {
        const next = new Set(prev);
        next.delete(asset.id);
        return next;
      });
    }
  };

  const changed = useCallback(async () => {
    await reload();
    onChanged?.();
  }, [reload, onChanged]);

  // A slot minted for a replacement the user gave up on would otherwise linger as pending_upload.
  const dropReplaceRun = (assetId: string) => {
    const run = replaceRuns.current[assetId];
    delete replaceRuns.current[assetId];
    for (const slot of Object.values(run?.slots ?? {})) {
      if (!slot.marked) removeSurveyAsset(surveyId, slot.assetId).catch(() => {});
    }
  };

  const replace = async (asset: SourceAsset, file: File) => {
    if (replaceRuns.current[asset.id]?.file !== file) dropReplaceRun(asset.id);
    const run = (replaceRuns.current[asset.id] ??= { file, slots: {} });
    const slots = run.slots;
    setReplacing((prev) => ({ ...prev, [asset.id]: { file, progress: 0, status: "uploading" } }));
    try {
      await uploadFiles(uploadApi, {
        surveyId,
        files: [{ file, kind: asset.kind, role: asset.role || assetRole(asset) || "", declaredCrs: asset.crs, replaces: asset.id }],
        slots,
        onProgress: (_name, progress) =>
          setReplacing((prev) => (prev[asset.id] ? { ...prev, [asset.id]: { ...prev[asset.id], progress } } : prev)),
      });
      delete replaceRuns.current[asset.id];
      setReplacing((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
      toast.success(`${assetName(asset)} replaced with ${file.name}; reprocess to rebuild its layer`);
      await changed();
    } catch (err) {
      setReplacing((prev) => ({ ...prev, [asset.id]: { file, progress: 0, status: "error" } }));
      toast.error(errorText(err, "The replacement couldn't upload."));
    }
  };

  const cancelReplace = (asset: SourceAsset) => {
    dropReplaceRun(asset.id);
    setReplacing((prev) => {
      const next = { ...prev };
      delete next[asset.id];
      return next;
    });
  };

  /** Rejects with the server's reason, so the caller's form can stay open. */
  const saveAsset = async (asset: SourceAsset, patch: UpdateSurveyAssetRequest) => {
    const updated = await updateSurveyAsset(surveyId, asset.id, patch);
    setAssets((prev) => prev?.map((a) => (a.id === asset.id ? { ...a, ...updated } : a)) ?? prev);
    toast.success(`${assetName(asset)} updated; reprocess to apply it`);
  };

  const remove = async (asset: SourceAsset) => {
    try {
      await removeSurveyAsset(surveyId, asset.id);
      toast.success(`${assetName(asset)} removed`);
      await changed();
    } catch (err) {
      toast.error(errorText(err, "The file couldn't be removed."));
    }
  };

  const enqueue = (list: File[]) => {
    setQueue((prev) => {
      const next = [...prev];
      for (const f of list) {
        if (next.some((q) => q.file.name === f.name)) continue;
        next.push({
          file: f,
          role: guessRole(f.name, dataType),
          readingRole: roleNeedsHeader(f.name, dataType),
          progress: 0,
          status: "queued",
        });
      }
      return next;
    });
    void refineRoles(list, dataType, (file, role) => setQueue((prev) => settleRole(prev, file, role)));
  };

  const setQueuedRole = (name: string, role: FileRole) =>
    setQueue((prev) => prev.map((q) => (q.file.name === name ? { ...q, role, readingRole: false } : q)));

  const readingRoles = queue.some((q) => q.readingRole);

  const dequeue = (name: string) => setQueue((prev) => prev.filter((q) => q.file.name !== name));

  const sourceCrs = survey ? surveySourceCrs(survey) : "";
  const effectiveQueueCrs = queueCrs ?? sourceCrs;

  const uploadQueue = async () => {
    if (queue.length === 0 || readingRoles) return;
    const files = queue;
    setAdding(true);
    setQueue((prev) => prev.map((q) => (q.status === "error" ? { ...q, status: "queued", progress: 0 } : q)));
    try {
      await uploadFiles(uploadApi, {
        surveyId,
        files: files.map((q) => ({ file: q.file, kind: roleToAssetKind(q.role), role: q.role, declaredCrs: effectiveQueueCrs || undefined })),
        slots: queueSlots.current,
        onStatus: (name, status) =>
          setQueue((prev) =>
            prev.map((q) => (q.file.name === name ? { ...q, status, ...(status === "uploaded" ? { progress: 1 } : {}) } : q))
          ),
        onProgress: (name, progress) => setQueue((prev) => prev.map((q) => (q.file.name === name ? { ...q, progress } : q))),
      });
      const ids = files.map((q) => queueSlots.current[q.file.name]?.assetId).filter((id): id is string => !!id);
      setAddedIds((prev) => new Set([...prev, ...ids]));
      queueSlots.current = {};
      setQueue([]);
      toast.success(`${plural(files.length, "file")} added; reprocess to build their layers`);
      await reload();
    } catch (err) {
      toast.error(errorText(err, "The files couldn't upload."));
    } finally {
      setAdding(false);
    }
  };

  const plan: ReprocessPlan | null = useMemo(
    () => (assets ? reprocessPlan(assets, { epsg: sourceCrs, alsoDue: new Set([...addedIds, ...chosenIds]) }) : null),
    [assets, sourceCrs, addedIds, chosenIds]
  );

  const failures = useMemo(() => failuresByAsset(processing, assets ?? []), [processing, assets]);

  const reprocess = async () => {
    if (!survey || !plan || plan.dispatches.length === 0) return;
    setReprocessing(true);
    setDispatched(null);
    let count = 0;
    let terrain = false;
    let statusMoved = false;
    try {
      if (survey.status === "ready_to_approve") {
        try {
          onSurvey(await updateSurveyStatus(survey.id, "processing"));
          statusMoved = true;
        } catch (err) {
          toast.error(`Couldn't move the survey back to processing: ${errorText(err, "the status change was refused")}`);
          return;
        }
      }
      for (const d of plan.dispatches) {
        await generateSurvey(survey.id, { ...d.request, version: "v1" });
        count++;
        if (d.request.processor_type === "terrain-quantized-mesh") terrain = true;
        const urls = new Set(d.request.inputs?.map((i) => i.url));
        const done = new Set(plan.assets.filter((a) => urls.has(a.url)).map((a) => a.id));
        setAddedIds((prev) => new Set([...prev].filter((id) => !done.has(id))));
        setChosenIds((prev) => new Set([...prev].filter((id) => !done.has(id))));
      }
      toast.success(`${plural(count, "processing workflow")} dispatched`);
    } catch (err) {
      toast.error(
        count > 0
          ? `${plural(count, "workflow")} dispatched, then: ${errorText(err, "a dispatch failed")}. Reprocess again for the rest.`
          : errorText(err, "Reprocessing couldn't start.")
      );
    } finally {
      if (count > 0) setDispatched({ count, terrain });
      if (count > 0 || statusMoved) await changed();
      if (count > 0) await Promise.all([loadProcessing(), useProcessing.getState().refreshSurvey(surveyId)]);
      setReprocessing(false);
    }
  };

  const uploading = adding || Object.values(replacing).some((r) => r.status === "uploading");
  const isDue = (asset: SourceAsset) => asset.needs_processing === true || addedIds.has(asset.id) || chosenIds.has(asset.id);
  /** Due only because it was picked, so it can be left out again. */
  const isChosen = (asset: SourceAsset) => chosenIds.has(asset.id) && asset.needs_processing !== true && !addedIds.has(asset.id);
  const choose = (list: SourceAsset[], on: boolean) =>
    setChosenIds((prev) => {
      const next = new Set(prev);
      for (const a of list) {
        if (on && canReprocess(a)) next.add(a.id);
        else next.delete(a.id);
      }
      return next;
    });

  return {
    assets,
    loadError,
    reload,
    replacing,
    replace,
    cancelReplace,
    saveAsset,
    remove,
    queue,
    enqueue,
    setQueuedRole,
    dequeue,
    queueCrs: effectiveQueueCrs,
    setQueueCrs,
    checkedAt,
    detectAgain,
    redetecting,
    adding,
    uploadQueue,
    readingRoles,
    plan,
    isDue,
    isChosen,
    choose,
    failures,
    processing,
    reprocess,
    reprocessing,
    dispatched,
    busy: uploading || reprocessing,
  };
}

export type SurveyFiles = ReturnType<typeof useSurveyFiles>;
