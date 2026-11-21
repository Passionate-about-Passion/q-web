import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-sap.svg';
  ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-microsoft.svg';
  ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-ibm.svg';
  ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-pwc.svg';
  ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-le-wagon.svg';
  ALTER TYPE "public"."hackathon_partner_logo_file" ADD VALUE 'partner-ace.webp';
  CREATE TABLE "page_hackathon_machine_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "page_hackathon_impressions_photos" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"alt" varchar,
  	"caption" varchar
  );
  
  CREATE TABLE "page_hackathon_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "page_hackathon_partner_pitch_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "_page_hackathon_v_version_machine_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_page_hackathon_impressions_photos_v" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"alt" varchar,
  	"caption" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_page_hackathon_v_version_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_page_hackathon_v_version_partner_pitch_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"_uuid" varchar
  );
  
  ALTER TABLE "faqs" ADD COLUMN "topic" varchar;
  ALTER TABLE "_faqs_v" ADD COLUMN "version_topic" varchar;
  ALTER TABLE "page_hackathon_schedule_items" ADD COLUMN "day" varchar;
  ALTER TABLE "page_hackathon_schedule_items" ADD COLUMN "mark" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "event_starts_at" timestamp(3) with time zone;
  ALTER TABLE "page_hackathon" ADD COLUMN "event_ends_at" timestamp(3) with time zone;
  ALTER TABLE "page_hackathon" ADD COLUMN "event_location" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "application_is_open" boolean DEFAULT false;
  ALTER TABLE "page_hackathon" ADD COLUMN "application_coming_soon_label" varchar DEFAULT 'Applications open soon';
  ALTER TABLE "page_hackathon" ADD COLUMN "machine_hint" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "machine_screen_line" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "aftermovie_heading" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "aftermovie_caption" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "impressions_heading" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "impressions_intro" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "partner_pitch_heading" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "partner_pitch_lede" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "partner_pitch_cta_label" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "partner_pitch_cta_href" varchar;
  ALTER TABLE "page_hackathon" ADD COLUMN "partner_pitch_contact_email" varchar;
  ALTER TABLE "_page_hackathon_v_version_schedule_items" ADD COLUMN "day" varchar;
  ALTER TABLE "_page_hackathon_v_version_schedule_items" ADD COLUMN "mark" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_event_starts_at" timestamp(3) with time zone;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_event_ends_at" timestamp(3) with time zone;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_event_location" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_application_is_open" boolean DEFAULT false;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_application_coming_soon_label" varchar DEFAULT 'Applications open soon';
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_machine_hint" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_machine_screen_line" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_aftermovie_heading" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_aftermovie_caption" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_impressions_heading" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_impressions_intro" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_partner_pitch_heading" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_partner_pitch_lede" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_partner_pitch_cta_label" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_partner_pitch_cta_href" varchar;
  ALTER TABLE "_page_hackathon_v" ADD COLUMN "version_partner_pitch_contact_email" varchar;
  ALTER TABLE "page_hackathon_machine_lines" ADD CONSTRAINT "page_hackathon_machine_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."page_hackathon"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "page_hackathon_impressions_photos" ADD CONSTRAINT "page_hackathon_impressions_photos_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "page_hackathon_impressions_photos" ADD CONSTRAINT "page_hackathon_impressions_photos_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."page_hackathon"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "page_hackathon_facts" ADD CONSTRAINT "page_hackathon_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."page_hackathon"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "page_hackathon_partner_pitch_points" ADD CONSTRAINT "page_hackathon_partner_pitch_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."page_hackathon"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_page_hackathon_v_version_machine_lines" ADD CONSTRAINT "_page_hackathon_v_version_machine_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_page_hackathon_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_page_hackathon_impressions_photos_v" ADD CONSTRAINT "_page_hackathon_impressions_photos_v_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_page_hackathon_impressions_photos_v" ADD CONSTRAINT "_page_hackathon_impressions_photos_v_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_page_hackathon_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_page_hackathon_v_version_facts" ADD CONSTRAINT "_page_hackathon_v_version_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_page_hackathon_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_page_hackathon_v_version_partner_pitch_points" ADD CONSTRAINT "_page_hackathon_v_version_partner_pitch_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_page_hackathon_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "page_hackathon_machine_lines_order_idx" ON "page_hackathon_machine_lines" USING btree ("_order");
  CREATE INDEX "page_hackathon_machine_lines_parent_id_idx" ON "page_hackathon_machine_lines" USING btree ("_parent_id");
  CREATE INDEX "page_hackathon_impressions_photos_order_idx" ON "page_hackathon_impressions_photos" USING btree ("_order");
  CREATE INDEX "page_hackathon_impressions_photos_parent_id_idx" ON "page_hackathon_impressions_photos" USING btree ("_parent_id");
  CREATE INDEX "page_hackathon_impressions_photos_image_idx" ON "page_hackathon_impressions_photos" USING btree ("image_id");
  CREATE INDEX "page_hackathon_facts_order_idx" ON "page_hackathon_facts" USING btree ("_order");
  CREATE INDEX "page_hackathon_facts_parent_id_idx" ON "page_hackathon_facts" USING btree ("_parent_id");
  CREATE INDEX "page_hackathon_partner_pitch_points_order_idx" ON "page_hackathon_partner_pitch_points" USING btree ("_order");
  CREATE INDEX "page_hackathon_partner_pitch_points_parent_id_idx" ON "page_hackathon_partner_pitch_points" USING btree ("_parent_id");
  CREATE INDEX "_page_hackathon_v_version_machine_lines_order_idx" ON "_page_hackathon_v_version_machine_lines" USING btree ("_order");
  CREATE INDEX "_page_hackathon_v_version_machine_lines_parent_id_idx" ON "_page_hackathon_v_version_machine_lines" USING btree ("_parent_id");
  CREATE INDEX "_page_hackathon_impressions_photos_v_order_idx" ON "_page_hackathon_impressions_photos_v" USING btree ("_order");
  CREATE INDEX "_page_hackathon_impressions_photos_v_parent_id_idx" ON "_page_hackathon_impressions_photos_v" USING btree ("_parent_id");
  CREATE INDEX "_page_hackathon_impressions_photos_v_image_idx" ON "_page_hackathon_impressions_photos_v" USING btree ("image_id");
  CREATE INDEX "_page_hackathon_v_version_facts_order_idx" ON "_page_hackathon_v_version_facts" USING btree ("_order");
  CREATE INDEX "_page_hackathon_v_version_facts_parent_id_idx" ON "_page_hackathon_v_version_facts" USING btree ("_parent_id");
  CREATE INDEX "_page_hackathon_v_version_partner_pitch_points_order_idx" ON "_page_hackathon_v_version_partner_pitch_points" USING btree ("_order");
  CREATE INDEX "_page_hackathon_v_version_partner_pitch_points_parent_id_idx" ON "_page_hackathon_v_version_partner_pitch_points" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "page_hackathon_machine_lines" CASCADE;
  DROP TABLE "page_hackathon_impressions_photos" CASCADE;
  DROP TABLE "page_hackathon_facts" CASCADE;
  DROP TABLE "page_hackathon_partner_pitch_points" CASCADE;
  DROP TABLE "_page_hackathon_v_version_machine_lines" CASCADE;
  DROP TABLE "_page_hackathon_impressions_photos_v" CASCADE;
  DROP TABLE "_page_hackathon_v_version_facts" CASCADE;
  DROP TABLE "_page_hackathon_v_version_partner_pitch_points" CASCADE;
  ALTER TABLE "page_hackathon_partners_groups_partners" ALTER COLUMN "logo_file" SET DATA TYPE text;
  ALTER TABLE "_page_hackathon_v_version_partners_groups_partners" ALTER COLUMN "logo_file" SET DATA TYPE text;
  DROP TYPE "public"."hackathon_partner_logo_file";
  CREATE TYPE "public"."hackathon_partner_logo_file" AS ENUM('69bfc230ceecbebceff708fc_new-logo.webp', '69b17a0e089f34c65a5e14a2_Picnic_logo.svg', '69bfc037724d038aa2ba26bc_image.png', '69c25665fc7b9cf5fb7a2889_f6961aac836f-Logo__2_.webp', '69d00444ac69243eaf2b4f4f_istari-logo.svg', '69c255cf7613b98e497cf289_OpenAI-black-wordmark(1).webp', '69b2e8289e0d3b7dd0ae9529_lovable_logo.svg', '69c99a0acf960a512107bc95_Anthropic_logo.svg', '69c256c8d3ff156cf6877066_elevenlabs-logo-black.webp', '69ccf786df18a395b3fee7fd_n8n_pink%2Bblack_logo.svg', '69d40a60aa0c813fdc6344eb_featherlessai-transparent.webp', '69d675fef0b853cb5df97e4e_liveavatar_logo_vertical_dark.webp', '69b458c74be9d2023714bcbf_itmx_logo.webp', '69d00453416ddd4a45dad964_mlh-logo-color-dark.svg', 'digitalocean-logo-horizontal-blue.svg', 'dev-logo-black.svg', 'elevenlabs-logo-black.svg');
  ALTER TABLE "page_hackathon_partners_groups_partners" ALTER COLUMN "logo_file" SET DATA TYPE "public"."hackathon_partner_logo_file" USING "logo_file"::"public"."hackathon_partner_logo_file";
  ALTER TABLE "_page_hackathon_v_version_partners_groups_partners" ALTER COLUMN "logo_file" SET DATA TYPE "public"."hackathon_partner_logo_file" USING "logo_file"::"public"."hackathon_partner_logo_file";
  ALTER TABLE "faqs" DROP COLUMN "topic";
  ALTER TABLE "_faqs_v" DROP COLUMN "version_topic";
  ALTER TABLE "page_hackathon_schedule_items" DROP COLUMN "day";
  ALTER TABLE "page_hackathon_schedule_items" DROP COLUMN "mark";
  ALTER TABLE "page_hackathon" DROP COLUMN "event_starts_at";
  ALTER TABLE "page_hackathon" DROP COLUMN "event_ends_at";
  ALTER TABLE "page_hackathon" DROP COLUMN "event_location";
  ALTER TABLE "page_hackathon" DROP COLUMN "application_is_open";
  ALTER TABLE "page_hackathon" DROP COLUMN "application_coming_soon_label";
  ALTER TABLE "page_hackathon" DROP COLUMN "machine_hint";
  ALTER TABLE "page_hackathon" DROP COLUMN "machine_screen_line";
  ALTER TABLE "page_hackathon" DROP COLUMN "aftermovie_heading";
  ALTER TABLE "page_hackathon" DROP COLUMN "aftermovie_caption";
  ALTER TABLE "page_hackathon" DROP COLUMN "impressions_heading";
  ALTER TABLE "page_hackathon" DROP COLUMN "impressions_intro";
  ALTER TABLE "page_hackathon" DROP COLUMN "partner_pitch_heading";
  ALTER TABLE "page_hackathon" DROP COLUMN "partner_pitch_lede";
  ALTER TABLE "page_hackathon" DROP COLUMN "partner_pitch_cta_label";
  ALTER TABLE "page_hackathon" DROP COLUMN "partner_pitch_cta_href";
  ALTER TABLE "page_hackathon" DROP COLUMN "partner_pitch_contact_email";
  ALTER TABLE "_page_hackathon_v_version_schedule_items" DROP COLUMN "day";
  ALTER TABLE "_page_hackathon_v_version_schedule_items" DROP COLUMN "mark";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_event_starts_at";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_event_ends_at";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_event_location";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_application_is_open";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_application_coming_soon_label";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_machine_hint";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_machine_screen_line";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_aftermovie_heading";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_aftermovie_caption";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_impressions_heading";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_impressions_intro";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_partner_pitch_heading";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_partner_pitch_lede";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_partner_pitch_cta_label";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_partner_pitch_cta_href";
  ALTER TABLE "_page_hackathon_v" DROP COLUMN "version_partner_pitch_contact_email";`)
}
