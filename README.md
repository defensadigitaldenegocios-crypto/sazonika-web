# sazonika.mx

Sitio y tienda en línea de **Sazonika** — intensificador de sabores para carne (Original · Umami Blend), hecho en Nuevo León.

- Bun + Hono, un solo archivo (`index.ts`); medios en `media/`.
- Postgres (Railway) para pedidos y comercios interesados.
- Cobro con Stripe Payment Links; webhook en `/api/stripe/webhook` registra pedidos y avisa por Telegram.
- Panel: `/admin` (usuario y contraseña en variables).

## Variables (Railway)
| Variable | Uso |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SAZONIKA_ADMIN_USER`, `SAZONIKA_ADMIN_PASS` | Acceso a `/admin` |
| `PAYMENT_LINK_PACK3`, `PAYMENT_LINK_PACK6`, `PAYMENT_LINK_RISTRA10` | Links de pago de Stripe (si faltan, el botón abre WhatsApp) |
| `STRIPE_WEBHOOK_SECRET` | Firma del webhook de Stripe |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Avisos de pedidos y comercios |

## Local
```
bun install && bun run dev
```
