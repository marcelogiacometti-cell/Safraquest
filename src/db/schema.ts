import { relations, sql } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ['MARKETING', 'DIRETORIA', 'REGIONAL', 'REPRESENTANTE', 'GESTOR', 'VENDEDOR']);
export const userStatusEnum = pgEnum('user_status', ['PENDING', 'ACTIVE', 'REJECTED', 'LEFT']);
export const channelTypeEnum = pgEnum('channel_type', ['COOPERATIVA', 'REVENDA']);
export const campaignStatusEnum = pgEnum('campaign_status', ['DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED']);
export const momentKindEnum = pgEnum('moment_kind', ['OPENING', 'REMINDER', 'LAST_CALL', 'RESULT']);
export const messageStatusEnum = pgEnum('message_status', ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED']);
export const reportKindEnum = pgEnum('report_kind', ['ERROR', 'CONFUSING', 'OUTDATED', 'OTHER', 'SUGGESTION']);
export const reportStatusEnum = pgEnum('report_status', ['OPEN', 'REVIEW', 'RESOLVED', 'DISCARDED']);
export const templateStatusEnum = pgEnum('template_status', ['APPROVED', 'IN_REVIEW', 'REJECTED']);

export const regionals = pgTable('regionals', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const distributors = pgTable('distributors', {
  id: id(),
  name: text('name').notNull().unique(),
  type: channelTypeEnum('type').notNull(),
  regionalId: text('regional_id').notNull().references(() => regionals.id),
  active: boolean('active').notNull().default(true),
  createdAt: created(),
});

export const units = pgTable('units', {
  id: id(),
  distributorId: text('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('Filial'),
}, (t) => [uniqueIndex('units_dist_name').on(t.distributorId, t.name)]);

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  whatsapp: text('whatsapp').unique(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  role: roleEnum('role').notNull(),
  status: userStatusEnum('status').notNull().default('PENDING'),
  distributorId: text('distributor_id').references(() => distributors.id),
  unitId: text('unit_id').references(() => units.id),
  regionalId: text('regional_id').references(() => regionals.id),
  invitedVia: text('invited_via'),
  consentAt: timestamp('consent_at', { withTimezone: true }),
  optOutAt: timestamp('opt_out_at', { withTimezone: true }),
  pausedUntil: timestamp('paused_until', { withTimezone: true }),
  notifyOptIn: boolean('notify_opt_in').notNull().default(true),
  createdAt: created(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  approvedById: text('approved_by_id'),
}, (t) => [index('users_role_status').on(t.role, t.status), index('users_dist').on(t.distributorId), index('users_unit').on(t.unitId)]);

export const repAssignments = pgTable('rep_assignments', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  distributorId: text('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userId, t.distributorId] })]);

export const inviteLinks = pgTable('invite_links', {
  id: id(),
  token: text('token').notNull().unique(),
  targetRole: roleEnum('target_role').notNull(),
  distributorId: text('distributor_id').references(() => distributors.id),
  unitId: text('unit_id').references(() => units.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  maxUses: integer('max_uses'),
  uses: integer('uses').notNull().default(0),
  createdById: text('created_by_id').notNull(),
  createdAt: created(),
});

export const loginCodes = pgTable('login_codes', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: created(),
}, (t) => [index('login_codes_user').on(t.userId, t.createdAt)]);

export const consentLogs = pgTable('consent_logs', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // GRANT | REVOKE
  source: text('source').notNull(),
  text: text('text'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export const channelGroups = pgTable('channel_groups', {
  id: id(),
  name: text('name').notNull().unique(),
  type: channelTypeEnum('type'),
  regionalId: text('regional_id').references(() => regionals.id),
  autoInclude: boolean('auto_include').notNull().default(true),
});

export const channelGroupMembers = pgTable('channel_group_members', {
  groupId: text('group_id').notNull().references(() => channelGroups.id, { onDelete: 'cascade' }),
  distributorId: text('distributor_id').notNull().references(() => distributors.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.groupId, t.distributorId] })]);

export const campaigns = pgTable('campaigns', {
  id: id(),
  name: text('name').notNull(),
  productName: text('product_name').notNull(),
  objective: text('objective'),
  materialUrl: text('material_url'),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  everyWeeks: integer('every_weeks').notNull().default(1),
  pointsPerHit: integer('points_per_hit').notNull().default(40),
  completionBonus: integer('completion_bonus').notNull().default(20),
  speedBonus: boolean('speed_bonus').notNull().default(false),
  minMissions: integer('min_missions').notNull().default(4),
  minUnitSellers: integer('min_unit_sellers').notNull().default(3),
  tiebreak: text('tiebreak').notNull().default('TIME'),
  status: campaignStatusEnum('status').notNull().default('DRAFT'),
  openWeekday: integer('open_weekday').notNull().default(1),
  openTime: text('open_time').notNull().default('09:00'),
  createdAt: created(),
});

export const campaignGroups = pgTable('campaign_groups', {
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  groupId: text('group_id').notNull().references(() => channelGroups.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.campaignId, t.groupId] })]);

export const missions = pgTable('missions', {
  id: id(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
  closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex('missions_camp_num').on(t.campaignId, t.number)]);

export const questions = pgTable('questions', {
  id: id(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  missionId: text('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  text: text('text').notNull(),
  options: text('options').array().notNull(),
  correct: integer('correct').notNull(),
  explanation: text('explanation'),
  timeLimit: integer('time_limit').notNull().default(30),
  points: integer('points'),
  topic: text('topic').notNull().default('Diferenciais do produto'),
  difficulty: text('difficulty').notNull().default('Média'),
  voided: boolean('voided').notNull().default(false),
}, (t) => [index('questions_mission').on(t.missionId, t.position)]);

export const attempts = pgTable('attempts', {
  id: id(),
  missionId: text('mission_id').notNull().references(() => missions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  currentPos: integer('current_pos').notNull().default(1),
  questionShownAt: timestamp('question_shown_at', { withTimezone: true }),
}, (t) => [uniqueIndex('attempts_mission_user').on(t.missionId, t.userId), index('attempts_user').on(t.userId)]);

export const answers = pgTable('answers', {
  id: id(),
  attemptId: text('attempt_id').notNull().references(() => attempts.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  chosen: integer('chosen').notNull(), // -1 = tempo esgotado
  correct: boolean('correct').notNull(),
  timeMs: integer('time_ms').notNull(),
  suspicious: boolean('suspicious').notNull().default(false),
  createdAt: created(),
}, (t) => [uniqueIndex('answers_attempt_q').on(t.attemptId, t.questionId)]);

export const messageMoments = pgTable('message_moments', {
  id: id(),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  kind: momentKindEnum('kind').notNull(),
  weekday: integer('weekday').notNull(), // 0=dom ... 6=sáb
  weekOffset: integer('week_offset').notNull().default(0), // 1 = semana seguinte à missão
  time: text('time').notNull(),
  templateName: text('template_name').notNull(),
  audience: text('audience').notNull(), // ALL | NOT_STARTED | NOT_FINISHED | FINISHED_PREVIOUS
});

export const messageLogs = pgTable('message_logs', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  missionId: text('mission_id').references(() => missions.id, { onDelete: 'set null' }),
  momentId: text('moment_id').references(() => messageMoments.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  templateName: text('template_name').notNull(),
  status: messageStatusEnum('status').notNull().default('QUEUED'),
  waMessageId: text('wa_message_id').unique(),
  error: text('error'),
  createdAt: created(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, (t) => [uniqueIndex('msg_user_mission_moment').on(t.userId, t.missionId, t.momentId), index('msg_status').on(t.status)]);

export const waTemplates = pgTable('wa_templates', {
  id: id(),
  name: text('name').notNull().unique(),
  category: text('category').notNull(),
  lang: text('lang').notNull().default('pt_BR'),
  status: templateStatusEnum('status').notNull().default('IN_REVIEW'),
  usedIn: text('used_in'),
  body: text('body'),
});

export const waConfig = pgTable('wa_config', {
  id: integer('id').primaryKey().default(1),
  wabaId: text('waba_id'),
  phoneNumberId: text('phone_number_id'),
  tokenEnc: text('token_enc'),
  appSecretEnc: text('app_secret_enc'),
  verifyToken: text('verify_token'),
  displayName: text('display_name'),
  sendFrom: text('send_from').notNull().default('08:00'),
  sendUntil: text('send_until').notNull().default('19:00'),
  maxPerWeek: integer('max_per_week').notNull().default(4),
  skipSundays: boolean('skip_sundays').notNull().default(true),
  pauseOnRed: boolean('pause_on_red').notNull().default(true),
  autoReply: text('auto_reply').notNull().default('Este número envia os avisos dos quizzes. Para jogar, use o link da mensagem semanal. Para parar de receber, responda SAIR.'),
  consentText: text('consent_text').notNull().default('Aceito receber os quizzes pelo WhatsApp e concordo com o uso dos meus dados conforme a política de privacidade.'),
  quality: text('quality').notNull().default('UNKNOWN'),
  lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const questionReports = pgTable('question_reports', {
  id: id(),
  questionId: text('question_id').references(() => questions.id, { onDelete: 'set null' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: reportKindEnum('kind').notNull(),
  text: text('text'),
  topic: text('topic'),
  status: reportStatusEnum('status').notNull().default('OPEN'),
  resolution: text('resolution'),
  createdAt: created(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [index('reports_status').on(t.status)]);

export const userBadges = pgTable('user_badges', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.key] })]);

export const closures = pgTable('closures', {
  id: id(),
  campaignId: text('campaign_id').notNull().unique().references(() => campaigns.id, { onDelete: 'cascade' }),
  closedAt: timestamp('closed_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  payload: jsonb('payload').notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  distributor: one(distributors, { fields: [users.distributorId], references: [distributors.id] }),
  unit: one(units, { fields: [users.unitId], references: [units.id] }),
}));
export { sql };
