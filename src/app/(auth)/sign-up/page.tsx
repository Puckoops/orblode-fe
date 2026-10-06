import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata: Metadata = { title: "Create an organisation" };

export default function SignUpPage() {
  return (
    <AuthFrame wide>
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthFrame>
  );
}
