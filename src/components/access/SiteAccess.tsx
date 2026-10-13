"use client";

import { Button, Drawer } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { useConfirm } from "@/components/common/confirm";
import { getProjectPermissions, type Project } from "@/lib/api/userSvc";
import { AccessList } from "./AccessList";

/** Who works on the site, opened in a drawer from the site's panel; changed by those who manage its people. */
export function SiteAccess({ site, className }: { site: Project; className?: string }) {
  const { confirm, confirmDialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectPermissions(site.id)
      .then((p) => !cancelled && setCanManage(Boolean(p.permissions.can_manage_users)))
      .catch((err) => {
        console.error("Failed to fetch the site's permissions:", err);
        if (!cancelled) setCanManage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="small block font-medium text-ink-1">Access</span>
          <span className="caption block text-ink-4">Roles given on this site, and those from its workspace.</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {canManage ? "Manage" : "View"}
        </Button>
      </div>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={`Access to ${site.name}`}
        description="Give people or teams roles on this site alone. Roles on its workspace reach every site in it and are changed in the workspace's settings."
        width={560}
      >
        {open && <AccessList scope="project" objectId={site.id} objectName={site.name} canManage={canManage} confirm={confirm} />}
      </Drawer>
      {confirmDialog}
    </div>
  );
}
