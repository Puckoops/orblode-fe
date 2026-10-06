import { Alert } from "@puckoops/camelot";

/** The one failure line above a form's fields. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return <Alert tone="critical" title={message} />;
}
