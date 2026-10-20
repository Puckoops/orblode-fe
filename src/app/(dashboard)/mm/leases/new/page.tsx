import { redirect } from "next/navigation";

export default function NewLeasePage() {
  redirect("/upload?create=lease");
}
