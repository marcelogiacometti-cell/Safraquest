CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('COOPERATIVA', 'REVENDA');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."moment_kind" AS ENUM('OPENING', 'REMINDER', 'LAST_CALL', 'RESULT');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('ERROR', 'CONFUSING', 'OUTDATED', 'OTHER', 'SUGGESTION');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'REVIEW', 'RESOLVED', 'DISCARDED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('MARKETING', 'DIRETORIA', 'REGIONAL', 'REPRESENTANTE', 'GESTOR', 'VENDEDOR');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('APPROVED', 'IN_REVIEW', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('PENDING', 'ACTIVE', 'REJECTED', 'LEFT');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"question_id" text NOT NULL,
	"chosen" integer NOT NULL,
	"correct" boolean NOT NULL,
	"time_ms" integer NOT NULL,
	"suspicious" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"mission_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"current_pos" integer DEFAULT 1 NOT NULL,
	"question_shown_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaign_groups" (
	"campaign_id" text NOT NULL,
	"group_id" text NOT NULL,
	CONSTRAINT "campaign_groups_campaign_id_group_id_pk" PRIMARY KEY("campaign_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"product_name" text NOT NULL,
	"objective" text,
	"material_url" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"every_weeks" integer DEFAULT 1 NOT NULL,
	"points_per_hit" integer DEFAULT 40 NOT NULL,
	"completion_bonus" integer DEFAULT 20 NOT NULL,
	"speed_bonus" boolean DEFAULT false NOT NULL,
	"min_missions" integer DEFAULT 4 NOT NULL,
	"min_unit_sellers" integer DEFAULT 3 NOT NULL,
	"tiebreak" text DEFAULT 'TIME' NOT NULL,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"open_weekday" integer DEFAULT 1 NOT NULL,
	"open_time" text DEFAULT '09:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_group_members" (
	"group_id" text NOT NULL,
	"distributor_id" text NOT NULL,
	CONSTRAINT "channel_group_members_group_id_distributor_id_pk" PRIMARY KEY("group_id","distributor_id")
);
--> statement-breakpoint
CREATE TABLE "channel_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "channel_type",
	"regional_id" text,
	"auto_include" boolean DEFAULT true NOT NULL,
	CONSTRAINT "channel_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "closures" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	CONSTRAINT "closures_campaign_id_unique" UNIQUE("campaign_id")
);
--> statement-breakpoint
CREATE TABLE "consent_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"text" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distributors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "channel_type" NOT NULL,
	"regional_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "distributors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"target_role" "role" NOT NULL,
	"distributor_id" text,
	"unit_id" text,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mission_id" text,
	"moment_id" text,
	"kind" text NOT NULL,
	"template_name" text NOT NULL,
	"status" "message_status" DEFAULT 'QUEUED' NOT NULL,
	"wa_message_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "message_logs_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
CREATE TABLE "message_moments" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"kind" "moment_kind" NOT NULL,
	"weekday" integer NOT NULL,
	"week_offset" integer DEFAULT 0 NOT NULL,
	"time" text NOT NULL,
	"template_name" text NOT NULL,
	"audience" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"number" integer NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text,
	"user_id" text NOT NULL,
	"kind" "report_kind" NOT NULL,
	"text" text,
	"topic" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"mission_id" text NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"options" text[] NOT NULL,
	"correct" integer NOT NULL,
	"explanation" text,
	"time_limit" integer DEFAULT 30 NOT NULL,
	"points" integer,
	"topic" text DEFAULT 'Diferenciais do produto' NOT NULL,
	"difficulty" text DEFAULT 'Média' NOT NULL,
	"voided" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regionals" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "regionals_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "rep_assignments" (
	"user_id" text NOT NULL,
	"distributor_id" text NOT NULL,
	CONSTRAINT "rep_assignments_user_id_distributor_id_pk" PRIMARY KEY("user_id","distributor_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"distributor_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'Filial' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text,
	"email" text,
	"password_hash" text,
	"role" "role" NOT NULL,
	"status" "user_status" DEFAULT 'PENDING' NOT NULL,
	"distributor_id" text,
	"unit_id" text,
	"regional_id" text,
	"invited_via" text,
	"consent_at" timestamp with time zone,
	"opt_out_at" timestamp with time zone,
	"paused_until" timestamp with time zone,
	"notify_opt_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by_id" text,
	CONSTRAINT "users_whatsapp_unique" UNIQUE("whatsapp"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wa_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"waba_id" text,
	"phone_number_id" text,
	"token_enc" text,
	"app_secret_enc" text,
	"verify_token" text,
	"display_name" text,
	"send_from" text DEFAULT '08:00' NOT NULL,
	"send_until" text DEFAULT '19:00' NOT NULL,
	"max_per_week" integer DEFAULT 4 NOT NULL,
	"skip_sundays" boolean DEFAULT true NOT NULL,
	"pause_on_red" boolean DEFAULT true NOT NULL,
	"auto_reply" text DEFAULT 'Este número envia os avisos dos quizzes. Para jogar, use o link da mensagem semanal. Para parar de receber, responda SAIR.' NOT NULL,
	"consent_text" text DEFAULT 'Aceito receber os quizzes pelo WhatsApp e concordo com o uso dos meus dados conforme a política de privacidade.' NOT NULL,
	"quality" text DEFAULT 'UNKNOWN' NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"lang" text DEFAULT 'pt_BR' NOT NULL,
	"status" "template_status" DEFAULT 'IN_REVIEW' NOT NULL,
	"used_in" text,
	"body" text,
	CONSTRAINT "wa_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_groups" ADD CONSTRAINT "campaign_groups_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_groups" ADD CONSTRAINT "campaign_groups_group_id_channel_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."channel_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_group_members" ADD CONSTRAINT "channel_group_members_group_id_channel_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."channel_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_group_members" ADD CONSTRAINT "channel_group_members_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_groups" ADD CONSTRAINT "channel_groups_regional_id_regionals_id_fk" FOREIGN KEY ("regional_id") REFERENCES "public"."regionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "closures" ADD CONSTRAINT "closures_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_logs" ADD CONSTRAINT "consent_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distributors" ADD CONSTRAINT "distributors_regional_id_regionals_id_fk" FOREIGN KEY ("regional_id") REFERENCES "public"."regionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_codes" ADD CONSTRAINT "login_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_moment_id_message_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."message_moments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_moments" ADD CONSTRAINT "message_moments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reports" ADD CONSTRAINT "question_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_assignments" ADD CONSTRAINT "rep_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rep_assignments" ADD CONSTRAINT "rep_assignments_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_regional_id_regionals_id_fk" FOREIGN KEY ("regional_id") REFERENCES "public"."regionals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_attempt_q" ON "answers" USING btree ("attempt_id","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attempts_mission_user" ON "attempts" USING btree ("mission_id","user_id");--> statement-breakpoint
CREATE INDEX "attempts_user" ON "attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_codes_user" ON "login_codes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "msg_user_mission_moment" ON "message_logs" USING btree ("user_id","mission_id","moment_id");--> statement-breakpoint
CREATE INDEX "msg_status" ON "message_logs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_camp_num" ON "missions" USING btree ("campaign_id","number");--> statement-breakpoint
CREATE INDEX "reports_status" ON "question_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "questions_mission" ON "questions" USING btree ("mission_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "units_dist_name" ON "units" USING btree ("distributor_id","name");--> statement-breakpoint
CREATE INDEX "users_role_status" ON "users" USING btree ("role","status");--> statement-breakpoint
CREATE INDEX "users_dist" ON "users" USING btree ("distributor_id");--> statement-breakpoint
CREATE INDEX "users_unit" ON "users" USING btree ("unit_id");