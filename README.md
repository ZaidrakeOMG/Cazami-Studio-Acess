# CAZAMI Access

Plataforma web de gestión de fiestas, invitaciones y folios, optimizada para teléfonos Android y computadoras.

## Estado
**Fase actual:** panel administrativo, folios CA, asociación de invitaciones e historial de limpieza. El generador QR y la aplicación Flutter son fases futuras.

## Stack
- Astro 7 y Vercel
- Supabase Auth, Postgres RLS y pg_cron
- Flutter Android/iOS (pendiente)

## Estructura
- apps/web/src/pages/admin.astro: acceso y panel administrativo
- apps/web/src/scripts/admin.ts: Auth, consultas y eventos
- apps/web/src/styles/admin.css: diseño responsive, mobile-first
- supabase/: documentación y migraciones

## Supabase
Se usa el proyecto Party-book autorizado expresamente por el propietario; todas las tablas nuevas empiezan con \`cazami_\`, y los procedimientos propios se alojan en \`cazami_internal\`. No se modificaron las tablas de invitaciones existentes.

### Primer acceso
1. En Supabase Auth, habilitar **email authentication** y **email confirmation**.
2. Configurar como redirect URL \`https://cazami-studio-access.vercel.app/admin\` en Auth > URL Configuration. Verificar URL del sitio.
3. Abrir \`/admin\`, escribir el correo administrador autorizado y pulsar «Enviar enlace de primer acceso».
4. Abrir el enlace desde ese correo; después, en «Mi cuenta», establecer una contraseña nueva, única y segura.
5. En futuros ingresos, usar correo y contraseña.

**Advertencia:** nunca guardar contraseñas en archivos ni en GitHub. El correo administrador se verifica del lado de la base de datos; una sesión autenticada no implica privilegios si no está en la lista blanca y el email no está confirmado.

### Eventos
- Se generan folios únicos CA-1, CA-2, CA-3...
- Cada evento conserva nombre, URL HTTPS de la invitación, cliente, fecha, límites y estado.
- Se pueden crear, editar, finalizar y consultar desde Android y PC.
- El folio CA-1 está vinculado a la invitación de Paula. Falta configurar su fecha.
- La limpieza manual está restringida a después de la fecha del evento y requiere escribir el folio de confirmación.
- La limpieza automática está programada diariamente en Supabase pg_cron; usa \`retention_days\` (predeterminado 30) y actúa solamente sobre tablas CAZAMI. El folio queda como historial.

## Privacidad y seguridad
- Auth y RLS son los controles reales; nunca confiar en verificar el correo solo en JavaScript.
- Las claves secretas no se usan en navegador o móvil.
- Aún NO habilitar acceso de clientes ni escáner antes de añadir roles y operaciones atómicas.
- Solo la lista blanca de administración puede gestionar eventos.
- Antes de uso comercial: revisar política de retención de datos, respaldos y pruebas de concurrencia.

## Próximas fases
Crear generador QR asociado al UUID interno del evento (no solo al folio), control de cupos y pases, y aplicación Flutter con confirmación atómica de accesos.
