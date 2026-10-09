import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFrame } from "@/components/auth/AuthFrame";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Loader } from "@/components/brand/Loader";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthFrame>
      <Suspense fallback={<Loader />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthFrame>
  );
}
