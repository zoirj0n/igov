import { getCurrentUser } from "@/lib/auth/server";
import { landingFor } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) {
    const rawNext = typeof sp.next === "string" ? sp.next : "";
    const safe =
      rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/login")
        ? rawNext
        : landingFor(user.role);
    redirect(safe);
  }
  // Empty when there is no explicit deep link, so the form can route the
  // signed-in role to its landing surface.
  const next = typeof sp.next === "string" ? sp.next : "";
  return <LoginForm next={next} />;
}
