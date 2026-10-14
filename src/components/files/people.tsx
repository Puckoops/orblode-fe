"use client";

import { createContext, useContext } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import type { Author } from "@/lib/api/orblodeSvc";
import type { OrgMember } from "@/lib/api/userSvc";

interface Person {
  name: string;
  avatar?: string;
}

const PeopleContext = createContext<ReadonlyMap<string, Person>>(new Map());

export const PeopleProvider = PeopleContext.Provider;

export function peopleById(members: OrgMember[]): ReadonlyMap<string, Person> {
  const people = new Map<string, Person>();
  for (const m of members) if (m.name?.trim()) people.set(m.user_id, { name: m.name.trim(), avatar: m.avatar_url });
  return people;
}

/** How to show who did something: "You", a member's name, or the email the record kept for someone no longer in the organisation. */
export function usePerson(author: Author | undefined): { label: string; name: string; avatar?: string } | null {
  const people = useContext(PeopleContext);
  const me = useAuthUser();
  if (!author) return null;
  if (me && author.id === me.id) return { label: "You", name: me.name || me.email, avatar: me.avatar_url };
  const person = people.get(author.id);
  const name = person?.name ?? author.email;
  return { label: name, name, avatar: person?.avatar };
}
