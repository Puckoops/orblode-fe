import { SessionProvider } from "@/components/session/SessionProvider";
import { AppFrame } from "@/components/shell/AppFrame";
import { sessionProfile } from "@/lib/session";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider profile={await sessionProfile()}>
      <AppFrame>{children}</AppFrame>
    </SessionProvider>
  );
}
