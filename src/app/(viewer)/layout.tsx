import { SessionProvider } from "@/components/session/SessionProvider";
import { AppFrame } from "@/components/shell/AppFrame";
import { sessionProfile } from "@/lib/session";

// The global rail stays beside the viewer so sites, create, files and settings are a click away;
// the viewer's own module rail lives inside its shell. Both groups share the root layout, so
// /globe ⇄ /viewer/:id stays a soft navigation.
export default async function ViewerLayout({ children }: LayoutProps<"/">) {
  return (
    <SessionProvider profile={await sessionProfile()}>
      <AppFrame variant="viewer">{children}</AppFrame>
    </SessionProvider>
  );
}
