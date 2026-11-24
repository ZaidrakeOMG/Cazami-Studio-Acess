# Cazami-Studio-Acess

**CAZAMI Access** es una plataforma comercial para generación de pases QR y control de acceso a eventos.

> Estado: arquitectura aprobada para planificación; implementación pendiente.

## Stack
- Astro + TypeScript: plataforma web de superadministrador, clientes y pases públicos
- Flutter: aplicación de control de acceso Android/iOS
- Supabase: Auth, PostgreSQL, RLS, Storage, Realtime y funciones del servidor
- Vercel: despliegue web
- GitHub: control de versiones y CI

## Módulos proyectados
1. Superadministrador, clientes, paquetes y pagos
2. Eventos con aislamiento por cliente y roles
3. Invitados, mesas, pases y QR seguros
4. Diseño, descarga y compartición de pases
5. Escáner móvil con control de aforo parcial
6. Registro de ingresos atómico, bitácora e informes en tiempo real
7. Seguridad, pruebas, supervisión y despliegue

## Reglas de seguridad
- **No usar el proyecto Supabase Party-book** para este producto; se creará uno independiente.
- No versionar contraseñas, tokens, claves privadas ni archivos `.env` reales.
- No exponer claves `service_role` en navegadores ni aplicaciones móviles.
- Autorización basada en Auth + RLS y membresía por evento; un código de fiesta no es una contraseña.
- Confirmar ingresos mediante transacciones atómicas e idempotentes.
- Escanear no implica registrar un ingreso; el operador debe confirmarlo.
- El modo offline no confirmará ingresos sin una estrategia segura contra duplicados.

## Fases
1. Arquitectura y base de datos
2. Panel de superadministrador
3. Panel de cliente
4. Generador y diseñador de pases
5. Aplicación Flutter
6. Validaciones y sincronización Realtime
7. Seguridad y pruebas
8. Publicación y comercialización

## Próximos pasos
- Crear un proyecto Supabase independiente para CAZAMI Access.
- Establecer estructura de carpetas, migraciones y pruebas.
- Desarrollar la primera versión funcional y verificar aislamiento por evento.

© CAZAMI Studio. Todos los derechos reservados.
