"use client";

// Which of the previous survey's piles a saved stockpile is. Matching by
// outline sets it automatically; picking here links it by hand, which
// matching then leaves alone.

import { Field, Select, Skeleton } from "@puckoops/camelot";
import { useEffect, useState } from "react";

import { getInventory, type InventoryReport, type Measurement } from "@/lib/api/orblodeSvc";
import { formatSurveyDate } from "@/lib/utils";

const NEW_PILE = "new";

export function PileLinkField({
  surveyId,
  measurement,
  onLink,
}: {
  surveyId: string;
  measurement: Measurement;
  onLink: (id: string, pileId: string) => Promise<void>;
}) {
  const [inventory, setInventory] = useState<Pick<InventoryReport, "previous_survey" | "previous_piles"> | null>(null);
  const [linking, setLinking] = useState(false);

  const [loadedFor, setLoadedFor] = useState(surveyId);
  if (loadedFor !== surveyId) {
    setLoadedFor(surveyId);
    setInventory(null);
  }

  useEffect(() => {
    let cancelled = false;
    getInventory(surveyId)
      .then((inv) => {
        if (!cancelled) setInventory(inv);
      })
      .catch(() => {
        if (!cancelled) setInventory({ previous_piles: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  if (inventory === null) return <Skeleton width="100%" height={36} />;
  if (!inventory.previous_survey) {
    return <p className="caption text-ink-4">No earlier survey has stockpiles, so this is a new pile.</p>;
  }

  const options = inventory.previous_piles;
  const current = options.some((p) => p.pile_id === measurement.pile_id) ? measurement.pile_id! : NEW_PILE;
  const hint =
    measurement.pile_link === "manual" ? "Linked by hand; outline matching leaves it alone." : "Matched by outline; pick to link by hand.";

  return (
    <Field label={`Same pile on ${formatSurveyDate(inventory.previous_survey.date)}`} hint={hint}>
      <Select
        value={current}
        disabled={linking}
        onValueChange={(v) => {
          setLinking(true);
          void onLink(measurement.id, v === NEW_PILE ? "" : v).finally(() => setLinking(false));
        }}
        options={[{ value: NEW_PILE, label: "None — a new pile" }, ...options.map((p) => ({ value: p.pile_id, label: p.name }))]}
      />
    </Field>
  );
}
