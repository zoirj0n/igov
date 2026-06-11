import { COUNTRIES } from "@/lib/data/countries";
import { notFound } from "next/navigation";
import { CountryProfileClient } from "./CountryProfileClient";

export default async function CountryProfilePage({
  params,
}: {
  params: Promise<{ iso3: string }>;
}) {
  const { iso3 } = await params;
  const upper = iso3.toUpperCase();
  const country = COUNTRIES.find((c) => c.iso3 === upper);
  if (!country) notFound();

  return <CountryProfileClient iso3={upper} />;
}
