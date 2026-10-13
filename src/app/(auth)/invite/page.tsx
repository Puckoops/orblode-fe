import type { Metadata } from "next";
import { Suspense } from "react";
import { AcceptInvitationForm } from "@/components/auth/AcceptInvitationForm";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { Loader } from "@/components/brand/Loader";

export const metadata: Metadata = { title: "Join your organisation" };

export default function InvitePage() {
  return (
    <AuthFrame>
      <Suspense fallback={<Loader />}>
        <AcceptInvitationForm />
      </Suspense>
    </AuthFrame>
  );
}
