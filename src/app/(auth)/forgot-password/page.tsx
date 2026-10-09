import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Loader } from "@/components/brand/Loader";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthFrame>
      <Suspense fallback={<Loader />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthFrame>
  );
}
