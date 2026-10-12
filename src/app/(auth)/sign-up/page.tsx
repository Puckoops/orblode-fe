import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { Loader } from "@/components/brand/Loader";
import { pendingGoogleSignUp } from "@/lib/google";

export const metadata: Metadata = { title: "Create an organisation" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const viaGoogle = (await searchParams).via === "google";
  const pending = viaGoogle ? await pendingGoogleSignUp() : null;
  const google = pending ? { name: pending.name, email: pending.email } : null;

  return (
    <AuthFrame wide>
      <Suspense fallback={<Loader />}>
        <SignUpForm key={google ? "google" : "email"} google={google} googleExpired={viaGoogle && !google} />
      </Suspense>
    </AuthFrame>
  );
}
