import { Context, SessionFlavor } from "grammy";

/**
 * Datos de sesión del bot por usuario de Telegram.
 * Grammy usa sessions en memoria por defecto; esto define el shape.
 */
export interface BotSessionData {
  /** ID del usuario autenticado en Trust Maker (tabla User.id) */
  userId: string | null;
  /** Timestamp de autenticación */
  authenticatedAt: number | null;
  /** Task ID for which the bot is expecting photo/document evidence */
  awaitingEvidenceTaskId: string | null;
  /** Bot's message ID that requested evidence (used to detect replies) */
  awaitingEvidenceBotMsgId: number | null;
  /** Paso actual del flujo de onboarding multi-step (1-5). null = no en onboarding */
  onboardingStep: number | null;
  /** ID del árbol que se está configurando en el onboarding */
  onboardingTreeId: string | null;
  /** ID del árbol seleccionado para conversación en DM */
  dmTreeId: string | null;
  /** File path awaiting link to a task (attach:link flow, step 2) */
  awaitingLinkFile: string | null;
  /** Tree ID for the file awaiting link (attach:link flow) */
  awaitingLinkTreeId: string | null;
  /** Whether the user chose "subtree_yes" in onboarding step 2 (used for step 3→4/5 routing) */
  onboardingSubtree?: boolean;
}

/**
 * Contexto extendido con sabor de sesión.
 * Usar este tipo en lugar del Context base de grammy.
 */
export type BotContext = Context & SessionFlavor<BotSessionData>;

/**
 * Comando del bot.
 * La propiedad `command` incluye el "/" inicial (ej: "/start").
 */
export interface BotCommand {
  command: string;
  description: string;
}
