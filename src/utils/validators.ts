import { z } from "zod";

export const Iso3CodeSchema = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, "must be ISO 3166-1 alpha-3");

export const LocaleSchema = z.enum(["en", "ar"]);

export const ClassificationSchema = z.enum(["public", "internal", "confidential", "secret"]);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type Iso3Code = z.infer<typeof Iso3CodeSchema>;
export type Locale = z.infer<typeof LocaleSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
