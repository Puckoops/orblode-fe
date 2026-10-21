import { Location01Icon } from "@hugeicons/core-free-icons";
import { Button, EmptyState } from "@puckoops/camelot";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <EmptyState
        icon={Location01Icon}
        title="This page doesn't exist."
        action={
          <Button asChild variant="ghost">
            <Link href="/projects">Back to your projects</Link>
          </Button>
        }
      />
    </main>
  );
}
