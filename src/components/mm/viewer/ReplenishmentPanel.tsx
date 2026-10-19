"use client";

import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Button,
  Field,
  HelperText,
  IconButton,
  Input,
  Select,
  Skeleton,
} from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ProfileChart,
  type ChartSeries,
} from "@/components/viewer/shell/ProfileChart";
import { refusalMessage } from "@/lib/api/client";
import {
  acceptAnalysis,
  createAnalysis,
  createMask,
  deleteMask,
  getSiteLease,
  listAnalyses,
  listMasks,
  listSurveyTags,
  type Analysis,
  type LeaseDetail,
  type Mask,
  type MaskKind,
  type Station,
  type SurveyTag,
} from "@/lib/api/mm";
import {
  getProfile,
  listSurveys,
  type ProfileResponse,
  type Survey,
} from "@/lib/api/orblodeSvc";
import { useMay } from "@/lib/access/sitePermissions";
import { ha, m3, thousands } from "@/lib/mm/format";
import { toast } from "@/lib/toast";
import {
  AnalysisSummary,
  StudyProgress,
  studyRunning,
} from "../AnalysisSummary";
import { useMmOverlay, useMmPolygonDraw, type Overlay } from "./useMmScene";

const MASK_KINDS: { value: MaskKind; label: string }[] = [
  { value: "water", label: "Water" },
  { value: "bank_strip", label: "Bank strip" },
  { value: "exclusion", label: "Exclusion" },
];

function SectionChart({
  station,
  analysis,
  onClose,
}: {
  station: Station;
  analysis: Analysis;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    const line = JSON.parse(station.line) as {
      type: "LineString";
      coordinates: number[][];
    };
    getProfile(
      analysis.post_survey_id,
      {
        line,
        spacing_m: 1,
        surfaces: [
          {
            type: "survey_terrain",
            survey_id: analysis.pre_survey_id,
            surface: analysis.surface,
          },
          {
            type: "survey_terrain",
            survey_id: analysis.post_survey_id,
            surface: analysis.surface,
          },
        ],
      },
      ctl.signal,
    )
      .then(setProfile)
      .catch(
        (err) =>
          !ctl.signal.aborted &&
          setError(refusalMessage(err, "Couldn't sample the section.")),
      );
    return () => ctl.abort();
  }, [station, analysis]);

  const series = useMemo<ChartSeries[]>(
    () =>
      profile
        ? [
            {
              key: "pre",
              label: "Pre-monsoon",
              color: "#9aabc2",
              z: profile.surfaces[0]?.z ?? null,
              error: profile.surfaces[0]?.error?.message,
              primary: false,
            },
            {
              key: "post",
              label: "Post-monsoon",
              color: "#f2a33a",
              z: profile.surfaces[1]?.z ?? null,
              error: profile.surfaces[1]?.error?.message,
              primary: true,
            },
          ]
        : [],
    [profile],
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline p-2">
      <div className="flex items-center justify-between">
        <span className="caption text-ink-2">
          Section {station.index + 1} · chainage {thousands(station.chainage_m)}{" "}
          m · +{station.deposition_m2.toFixed(1)} / −
          {station.erosion_m2.toFixed(1)} m²
        </span>
        <Button size="sm" variant="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      {error ? (
        <HelperText tone="error">{error}</HelperText>
      ) : !profile ? (
        <Skeleton height={180} />
      ) : (
        <div style={{ height: 200 }}>
          <ProfileChart
            distances={profile.distance_m}
            vertices={profile.vertices_m}
            lengthM={profile.length_m}
            spacingM={profile.spacing_m}
            series={series}
            system="metric"
            mode="elevation"
            ratio="fit"
            pins={[]}
            onPin={() => undefined}
            highlight={null}
            onCursor={() => undefined}
            resetKey={`${analysis.id}:${station.index}`}
          />
        </div>
      )}
    </div>
  );
}

/** The viewer's minor-minerals module: the lease on the scene, the masks that leave water and banks out, and a
 * replenishment study of two surveys of the site with its cross-sections. */
export function ReplenishmentPanel({
  projectId,
  surveyId,
}: {
  projectId: string;
  surveyId: string | null;
}) {
  const router = useRouter();
  const [lease, setLease] = useState<LeaseDetail | null | undefined>(undefined);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [tags, setTags] = useState<SurveyTag[]>([]);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [pre, setPre] = useState("");
  const [post, setPost] = useState("");
  const [maskIds, setMaskIds] = useState<string[] | null>(null);
  const [proposed, setProposed] = useState("");
  const [waterTable, setWaterTable] = useState("");
  const [spacing, setSpacing] = useState("50");
  const [maskKind, setMaskKind] = useState<MaskKind>("water");
  const [maskName, setMaskName] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Analysis | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const mayMask = useMay(projectId, "can_create_measurement");
  const mayRun = useMay(projectId, "can_run_analysis");

  const load = useCallback(
    () =>
      Promise.all([
        getSiteLease(projectId).catch(() => null),
        listSurveys(projectId).then((r) =>
          r.surveys
            .slice()
            .sort((a, b) => b.survey_date.localeCompare(a.survey_date)),
        ),
        listSurveyTags(projectId).catch(() => [] as SurveyTag[]),
        listMasks(projectId).catch(() => [] as Mask[]),
      ]).then(([l, s, t, m]) => {
        setLease(l);
        setSurveys(s);
        setTags(t);
        setMasks(m);
        const tagged = (season: string) =>
          t.find((x) => x.season === season)?.survey_id ?? "";
        setPost((v) => v || tagged("post") || surveyId || s[0]?.id || "");
        setPre(
          (v) =>
            v ||
            tagged("pre") ||
            s.find((x) => x.id !== (tagged("post") || surveyId))?.id ||
            "",
        );
        if (!l) return;
        return listAnalyses(l.id)
          .catch(() => [] as Analysis[])
          .then((a) => {
            setAnalyses(a);
            setShown((current) => current ?? a[0] ?? null);
          });
      }),
    [projectId, surveyId],
  );

  const running = shown !== null && studyRunning(shown);
  const leaseOf = lease?.id;
  useEffect(() => {
    if (!running || !leaseOf) return;
    const t = window.setInterval(() => {
      listAnalyses(leaseOf)
        .then((list) => {
          setAnalyses(list);
          setShown(
            (current) => list.find((a) => a.id === current?.id) ?? current,
          );
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [running, leaseOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const draw = useMmPolygonDraw(async (ring) => {
    try {
      const coordinates = [
        [...ring.map((p) => [p.lon, p.lat]), [ring[0].lon, ring[0].lat]],
      ];
      const mask = await createMask({
        project_id: projectId,
        survey_id: surveyId ?? undefined,
        kind: maskKind,
        name: maskName.trim(),
        geometry: { type: "Polygon", coordinates },
      });
      setMasks((list) => [...list, mask]);
      setMaskName("");
      toast.success(`Mask saved: ${ha(mask.area_m2)}.`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't save the mask."));
    }
  });

  const overlays = useMemo<Overlay[]>(() => {
    const out: Overlay[] = [];
    if (lease?.boundary_geometry)
      out.push({
        id: "lease",
        geometry: lease.boundary_geometry,
        line: "#f2a33a",
        width: 3,
      });
    for (const m of masks)
      out.push({
        id: m.id,
        geometry: m.geometry,
        line: "#5aa3e6",
        fill: "rgba(90,163,230,0.35)",
      });
    for (const st of shown?.results.end_area.stations ?? []) {
      out.push({
        id: `st:${st.index}`,
        geometry: JSON.parse(st.line),
        line:
          st.index === station?.index ? "#ffffff" : "rgba(255,255,255,0.45)",
        width: st.index === station?.index ? 3 : 1,
      });
    }
    return out;
  }, [lease, masks, shown, station]);
  useMmOverlay(overlays);

  if (lease === undefined) return <Skeleton height={240} className="m-3" />;
  if (lease === null)
    return (
      <Alert tone="info" title="This site has no lease" className="m-3">
        Replenishment is measured inside a lease boundary.{" "}
        <Link href="/mm/leases/new">Start an application</Link> for this site.
      </Alert>
    );

  const options = surveys.map((s) => {
    const season = tags.find((t) => t.survey_id === s.id)?.season;
    return {
      value: s.id,
      label: `${s.survey_date}${season ? ` · ${season === "pre" ? "pre" : "post"}-monsoon` : ""}`,
    };
  });
  const chosenMasks =
    maskIds ?? masks.filter((m) => m.kind !== "exclusion").map((m) => m.id);

  const measure = async () => {
    if (!pre || !post || pre === post) {
      toast.error("Choose two different surveys.");
      return;
    }
    setBusy(true);
    try {
      const a = await createAnalysis({
        lease_id: lease.id,
        pre_survey_id: pre,
        post_survey_id: post,
        mask_ids: chosenMasks,
        proposed_m3: Number(proposed) || 0,
        water_table_depth_m: waterTable ? Number(waterTable) : undefined,
        spacing_m: Number(spacing) || 50,
      });
      setAnalyses((list) => [a, ...list]);
      setShown(a);
      setStation(null);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't measure the replenishment."));
    } finally {
      setBusy(false);
    }
  };

  const accept = async (a: Analysis) => {
    try {
      const r = await acceptAnalysis(a.id);
      router.push(`/mm/reports/${r.id}`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't accept the study."));
    }
  };

  return (
    <div className="flex flex-col gap-5 px-3 pb-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/mm/leases/${lease.id}`}
          className="small font-medium text-ink-1 hover:underline"
        >
          {lease.name}
        </Link>
        <span className="caption text-ink-4">
          {lease.boundary
            ? `${ha(lease.boundary.area_m2)} · permitted depth ${lease.permitted_depth_m} m`
            : "No boundary yet: set it on the lease."}
        </span>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="small font-semibold text-ink-1">Masks</h3>
        {masks.length === 0 && (
          <HelperText>
            Draw the water channel and bank strips: they’re left out of the
            volume.
          </HelperText>
        )}
        {masks.map((m) => (
          <div key={m.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Leave out ${m.name || m.kind}`}
              checked={chosenMasks.includes(m.id)}
              onChange={(e) =>
                setMaskIds(
                  e.target.checked
                    ? [...chosenMasks, m.id]
                    : chosenMasks.filter((x) => x !== m.id),
                )
              }
            />
            <span className="caption flex-1 text-ink-2">
              {m.name || MASK_KINDS.find((k) => k.value === m.kind)?.label} ·{" "}
              {ha(m.area_m2)}
            </span>
            {mayMask && (
              <IconButton
                icon={Delete02Icon}
                aria-label={`Remove ${m.name || m.kind}`}
                variant="bare"
                size="sm"
                onClick={() =>
                  void deleteMask(projectId, m.id).then(
                    () => setMasks((list) => list.filter((x) => x.id !== m.id)),
                    (err) =>
                      toast.error(
                        refusalMessage(err, "Couldn't remove the mask."),
                      ),
                  )
                }
              />
            )}
          </div>
        ))}
        {mayMask &&
          (draw.drawing ? (
            <div className="flex flex-col gap-2 rounded-md border border-hairline p-2">
              <span className="caption text-ink-3">
                Click the corners on the scene ({draw.count} so far).
                Double-click or Enter closes it; Escape stops.
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={draw.count < 3}
                  onClick={draw.finish}
                >
                  Finish
                </Button>
                <Button size="sm" variant="quiet" onClick={draw.cancel}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <Select
                aria-label="Mask kind"
                value={maskKind}
                onValueChange={(v) => setMaskKind(v as MaskKind)}
                options={MASK_KINDS}
              />
              <Input
                aria-label="Mask name"
                value={maskName}
                onChange={(e) => setMaskName(e.target.value)}
                placeholder="Name"
              />
              <Button
                size="sm"
                variant="ghost"
                iconStart={PencilEdit02Icon}
                onClick={draw.start}
              >
                Draw
              </Button>
            </div>
          ))}
      </section>

      {mayRun && lease.boundary && (
        <section className="flex flex-col gap-3">
          <h3 className="small font-semibold text-ink-1">Measure</h3>
          <Field label="Pre-monsoon">
            <Select
              value={pre}
              onValueChange={setPre}
              options={options}
              placeholder="Choose"
            />
          </Field>
          <Field label="Post-monsoon">
            <Select
              value={post}
              onValueChange={setPost}
              options={options}
              placeholder="Choose"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Proposed m³/yr">
              <Input
                type="number"
                min="0"
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
              />
            </Field>
            <Field label="Water table (m)">
              <Input
                type="number"
                min="0"
                step="0.1"
                value={waterTable}
                onChange={(e) => setWaterTable(e.target.value)}
              />
            </Field>
            <Field label="Sections every (m)">
              <Input
                type="number"
                min="5"
                value={spacing}
                onChange={(e) => setSpacing(e.target.value)}
              />
            </Field>
          </div>
          <div>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={() => void measure()}
            >
              Measure replenishment
            </Button>
          </div>
        </section>
      )}

      {analyses.length > 0 && shown && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="small flex-1 font-semibold text-ink-1">Study</h3>
            <Select
              aria-label="Study"
              value={shown.id}
              onValueChange={(id) => {
                setShown(analyses.find((a) => a.id === id) ?? null);
                setStation(null);
              }}
              options={analyses.map((a) => ({
                value: a.id,
                label: `${surveys.find((s) => s.id === a.pre_survey_id)?.survey_date ?? "pre"} → ${surveys.find((s) => s.id === a.post_survey_id)?.survey_date ?? "post"} · ${
                  studyRunning(a)
                    ? "measuring"
                    : a.status === "failed"
                      ? "failed"
                      : m3(a.results.adopted_m3)
                }`,
              }))}
            />
          </div>
          {studyRunning(shown) || shown.status === "failed" ? (
            <StudyProgress a={shown} />
          ) : (
            <>
              <AnalysisSummary a={shown} compact />
              <div className="flex flex-col gap-1">
                <span className="caption text-ink-4">
                  Sections: click one to see the two surfaces across it.
                </span>
                <div className="flex flex-wrap gap-1">
                  {shown.results.end_area.stations.map((st) => (
                    <button
                      key={st.index}
                      type="button"
                      onClick={() => setStation(st)}
                      className={`caption rounded-sm border px-2 py-0.5 ${station?.index === st.index ? "border-hairline-strong bg-emphasis-quiet text-ink-1" : "border-hairline text-ink-3"}`}
                    >
                      {thousands(st.chainage_m)} m
                    </button>
                  ))}
                </div>
              </div>
              {station && (
                <SectionChart
                  key={`${shown.id}:${station.index}`}
                  station={station}
                  analysis={shown}
                  onClose={() => setStation(null)}
                />
              )}
              {mayRun &&
                (shown.status === "accepted" && shown.report_id ? (
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/mm/reports/${shown.report_id}`}>
                      Open its report
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void accept(shown)}
                  >
                    Accept and draft the report
                  </Button>
                ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
