import { redirect } from "next/navigation";

export default async function GlobePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const one of [value].flat()) if (one !== undefined) query.append(key, one);
  }
  redirect(query.size ? `/projects?${query}` : "/projects");
}
