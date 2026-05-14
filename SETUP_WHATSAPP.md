# WhatsApp Cloud API — Configuración (Meta)

Este documento describe los pasos para registrar Trust Maker en
WhatsApp Cloud API de Meta y conectar el webhook.

## Requisitos previos

- Cuenta de Facebook Business (business.facebook.com)
- Número de teléfono **no registrado en WhatsApp** (se usa solo para la API)
- Servidor con HTTPS público (Meta no envía webhooks a HTTP)

## Paso 1: Crear app en Meta Developers

1. Ve a https://developers.facebook.com/
2. Haz clic en **"Create App"** (o "Mis aplicaciones" → "Crear aplicación")
3. Selecciona el tipo **"Business"** (o "Empresa")
4. Llena los campos:
   - **App name**: `Trust Maker`
   - **App contact email**: tu email
   - **Business account**: selecciona o crea una cuenta de negocio
5. Haz clic en **"Create App"**

## Paso 2: Configurar WhatsApp en la app

1. En el dashboard de tu app, busca **"WhatsApp"** en el panel izquierdo
   (o usa el buscador de productos: "WhatsApp")
2. Haz clic en **"Set up"** (Configurar)
3. Se abrirá el panel de WhatsApp. Verás:
   - **Phone number ID** — guárdalo, es tu `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** — guárdalo también
4. Si no tienes un número de prueba, haz clic en **"Add phone number"**
   y sigue el wizard para verificar un número vía SMS o llamada.
   También puedes usar el número de prueba temporal (Test Number).

## Paso 3: Generar token de acceso permanente

1. En el panel de WhatsApp, busca **"System User"** o ve a:
   `Configuración de la app` → `Roles` → `System Users`
2. Crea un System User con rol **"Admin"**
3. Genera un **token de acceso**:
   - Ve a `System User` → `Generate Token`
   - Selecciona tu app (`Trust Maker`)
   - Permisos necesarios: `whatsapp_business_messaging`, `whatsapp_business_management`
   - Copia el token generado → es tu `WHATSAPP_ACCESS_TOKEN`

> El token no expira si es de System User. Los tokens de prueba de Meta
> Developers expiran en 24h — NO los uses en producción.

## Paso 4: Configurar el webhook

1. En el panel de WhatsApp, ve a **"Configuration"**
2. Busca la sección **"Webhook"** y haz clic en **"Edit"**
3. Llena los campos:
   - **Callback URL**: `https://TU_DOMINIO/api/whatsapp/webhook`
   - **Verify token**: el valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - (Debe ser un string alfanumérico, al menos 8 caracteres. Ej: `TrUsTmAkEr2026!`)

4. Haz clic en **"Verify and Save"**
5. Si la verificación es exitosa, verás el webhook como "Subscribed"

## Paso 5: Suscribirse a los eventos

1. En la misma sección **"Webhook fields"**, haz clic en **"Manage"**
2. Suscríbete a los siguientes campos:
   - ✅ `messages` — mensajes entrantes de usuarios
   - ✅ `message_template_status_update` — status de templates (opcional)

## Paso 6: Configurar variables de entorno

Agrega estas variables al archivo `.env` del backend:

```bash
# WhatsApp Cloud API (Meta)
WHATSAPP_VERIFY_TOKEN=TrUsTmAkEr2026!     # Token que pusiste en Meta (step 4)
WHATSAPP_ACCESS_TOKEN=EAAx...             # Token del System User (step 3)
WHATSAPP_PHONE_NUMBER_ID=123456789012345  # ID del número (step 2)
PAYMENT_LINK=https://trustmaker.app/pagos # URL de pagos (para notificaciones)
```

Reinicia el servidor después de agregar las variables.

## Verificar que funciona

```bash
# Health check local
curl http://localhost:3100/api/whatsapp/health
# Respuesta esperada: {"configured":true,"phoneNumberId":"123456789012345"}

# Enviar un mensaje de prueba desde Meta Developers
# Ve a WhatsApp > API Setup > "Send a test message"
# El mensaje debería aparecer en los logs del servidor:
# [WhatsApp] 📩 +569XXXXXXXX (text): "Hola"
```

## Troubleshooting

| Problema | Solución |
|---|---|
| "Webhook not verified" | Verifica que `WHATSAPP_VERIFY_TOKEN` coincida exactamente con lo que pusiste en Meta |
| "HTTPS required" | Meta no envía webhooks a HTTP. Usa ngrok, cloudflared tunnel, o un dominio con SSL |
| "Invalid OAuth token" | Tu `WHATSAPP_ACCESS_TOKEN` expiró o no tiene los permisos `whatsapp_business_messaging` |
| Mensajes no llegan | Verifica que el webhook esté "Subscribed" y que `messages` esté tildado en Webhook Fields |

## Alternativa: Twilio Sandbox

Si prefieres Twilio sobre Meta Cloud API:

1. Crea cuenta en https://twilio.com
2. Ve a **Messaging** → **Try it out** → **Send a WhatsApp message**
3. Activa el **Sandbox** siguiendo las instrucciones (envía el código de join al número de Twilio)
4. Configura el webhook URL: `https://TU_DOMINIO/api/whatsapp/webhook`
5. Variables de entorno con Twilio:
   ```bash
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_NUMBER=+14155238886  # Número sandbox de Twilio
   ```
