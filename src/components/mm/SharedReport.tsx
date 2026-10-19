"use client";

import { Download01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { Alert, Button, Card, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { OrblodeLogo } from "@/components/brand/OrblodeLogo";
import { PUBLIC_API, type PublicShare } from "@/lib/api/mm";
import { bytes, dateOf, m3 } from "@/lib/mm/format";
import { Figure, Figures, StatusChip, VERDICT } from "./common";

/** What a shared link opens, without signing in: the vetted report's figures and its files. */
export function SharedReport({ token }: { token: string }) {
  const [share, setShare] = useState<PublicShare | null>(null);
  const [gone, setGone] = useState<"missing" | "busy" | null>(null);

  useEffect(() => {
    fetch(`${PUBLIC_API}/shares/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 429) return setGone("busy");
        if (!res.ok) return setGone("missing");
        setShare(((await res.json()) as { data: PublicShare }).data);
      })
      .catch(() => setGone("busy"));
  }, [token]);

  const fileUrl = (id: string) => `${PUBLIC_API}/shares/${encodeURIComponent(token)}/files/${encodeURIComponent(id)}`;

  return (
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <OrblodeLogo size={28} />
        {gone ? (
          <Alert tone={gone === "busy" ? "warning" : "critical"} title={gone === "busy" ? "Too many requests" : "This link doesn't work any more"}>
            {gone === "busy" ? "Wait a minute and open the link again." : "It may have expired or been revoked. Ask whoever sent it for a new one."}
          </Alert>
        ) : !share ? (
          <Skeleton height={320} />
        ) : (
          <>
            <header className="flex flex-col gap-1">
              <span className="caption uppercase tracking-wide text-ink-4">Replenishment report · version {share.version}</span>
              <h1 className="text-[28px] font-semibold leading-tight text-ink-1">{share.title}</h1>
              <p className="small text-ink-3">
                {[share.lease_name, share.river && `${share.river} river`, share.district].filter(Boolean).join(" · ")} · vetted {dateOf(share.vetted_at)}
              </p>
            </header>
            {share.superseded && (
              <Alert tone="info" title="A newer version exists">
                This is the version that was shared with you. Ask the sender for the current one.
              </Alert>
            )}
            {share.pending && <Alert tone="info" title="The files are still being prepared">Open the link again in a minute.</Alert>}
            <Figures>
              <Figure label="Lease area" value={`${share.summary.area_ha.toFixed(2)} ha`} />
              <Figure label="Replenished" value={m3(share.summary.replenished_m3)} />
              <Figure label="Proposed extraction" value={`${m3(share.summary.proposed_m3)}/yr`} note={`${share.summary.ratio_pct.toFixed(0)} % of replenishment`} />
              <Figure label="Verdict" value={<StatusChip map={VERDICT} value={share.summary.verdict} />} note={share.summary.recommendation} />
            </Figures>
            <Card padding="flush">
              <Table minWidth={480}>
                <THead>
                  <Tr>
                    <Th>File</Th>
                    <Th numeric>Size</Th>
                    <Th>
                      <span className="visually-hidden">Open</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {share.files.map((f) => (
                    <Tr key={f.id}>
                      <Td primary>{f.name}</Td>
                      <Td numeric>{bytes(f.size)}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" iconStart={share.access === "download" ? Download01Icon : ViewIcon} asChild>
                          <a href={fileUrl(f.id)} target="_blank" rel="noopener noreferrer">
                            {share.access === "download" ? "Download" : "View"}
                          </a>
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
            <p className="caption text-ink-4">
              Shared with {share.recipient}
              {share.expires_at ? ` until ${dateOf(share.expires_at)}` : ""}. SHA-256 of the vetted PDF: <code className="break-all">{share.sha256}</code>. Opening this page is logged.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
