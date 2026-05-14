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
