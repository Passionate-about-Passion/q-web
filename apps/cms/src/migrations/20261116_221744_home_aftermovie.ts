import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_home" ADD COLUMN "aftermovie_eyebrow" varchar;
  ALTER TABLE "page_home" ADD COLUMN "aftermovie_heading" varchar;
  ALTER TABLE "_page_home_v" ADD COLUMN "version_aftermovie_eyebrow" varchar;
  ALTER TABLE "_page_home_v" ADD COLUMN "version_aftermovie_heading" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_home" DROP COLUMN "aftermovie_eyebrow";
  ALTER TABLE "page_home" DROP COLUMN "aftermovie_heading";
  ALTER TABLE "_page_home_v" DROP COLUMN "version_aftermovie_eyebrow";
  ALTER TABLE "_page_home_v" DROP COLUMN "version_aftermovie_heading";`)
}
