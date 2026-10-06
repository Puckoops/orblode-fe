import { Button } from "@puckoops/camelot";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/AuthFrame";
import styles from "@/components/auth/auth.module.css";
import { accountPost, safeNext } from "@/lib/account";

export const metadata: Metadata = { title: "Confirm your email" };

/** The confirmation link's landing page. Confirming twice is fine, so a mail scanner opening the link first does no harm. */
export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { token, next } = await searchParams;
  const after = safeNext(next);
  const signIn = after ? `/sign-in?next=${encodeURIComponent(after)}` : "/sign-in";
  const reply = typeof token === "string" && token ? await accountPost<{ name?: string }>("/user/verify-email", { token }) : null;

  return (
    <AuthFrame>
      {reply?.ok ? (
        <>
          <h1 className="quote">Email confirmed</h1>
          <p className={`small ${styles.lede}`}>
            {reply.data?.name ? `You're all set, ${reply.data.name}. ` : "You're all set. "}Sign in to open your sites.
          </p>
          <div className={styles.form}>
            <Button asChild variant="primary" size="lg" className={styles.submit}>
              <Link href={signIn}>Sign in</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <h1 className="quote">This link didn&rsquo;t work</h1>
          <p className={`small ${styles.lede}`}>
            {reply?.status && reply.status >= 500
              ? "We couldn't confirm your email just now. Open the link again in a moment."
              : "Confirmation links expire after 24 hours. Sign in and we'll offer to send a fresh one."}
          </p>
          <div className={styles.form}>
            <Button asChild variant="ghost" size="lg" className={styles.submit}>
              <Link href={signIn}>Back to sign in</Link>
            </Button>
          </div>
        </>
      )}
    </AuthFrame>
  );
}
