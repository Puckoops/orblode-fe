import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { SignInForm } from "@/components/auth/SignInForm";
import { Loader } from "@/components/brand/Loader";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthFrame>
      <Suspense fallback={<Loader />}>
        <SignInForm />
      </Suspense>
    </AuthFrame>
  );
}
